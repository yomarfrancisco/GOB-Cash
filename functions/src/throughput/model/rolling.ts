import { clamp, hhi, sharesFromWeights, sum } from "./math";
import type {
  AllocationPlan,
  ConcentrationModel,
  HazardDecomposition,
  PairRecord,
  Resource,
  RollingWindow,
  Scenario,
  SimState,
} from "./types";

export const ROLLING_HORIZON = 30;

export function emptyRolling(): RollingWindow {
  return { volumes: [], counts: [], consecutiveActiveDays: 0, daysSinceLastUse: 0 };
}

export function pushRolling(window: RollingWindow, volume: number, count: number): void {
  const v = Math.max(0, volume);
  const c = Math.max(0, count);
  window.volumes.push(v);
  window.counts.push(c);
  if (window.volumes.length > ROLLING_HORIZON) {
    window.volumes.shift();
    window.counts.shift();
  }
  if (v > 1e-9) {
    window.consecutiveActiveDays += 1;
    window.daysSinceLastUse = 0;
  } else {
    window.consecutiveActiveDays = 0;
    window.daysSinceLastUse += 1;
  }
}

export function shareOfActiveDaysN(window: RollingWindow | undefined, n: number): number {
  if (!window || n <= 0) return 0;
  const span = Math.min(n, Math.max(1, window.volumes.length));
  return activeDaysN(window, n) / span;
}

export function daysSinceLastUse(window: RollingWindow | undefined): number {
  return window?.daysSinceLastUse ?? 0;
}

export function volumeN(window: RollingWindow | undefined, n: number): number {
  if (!window || n <= 0) return 0;
  return sum(window.volumes.slice(-n));
}

export function countN(window: RollingWindow | undefined, n: number): number {
  if (!window || n <= 0) return 0;
  return sum(window.counts.slice(-n));
}

export function activeDaysN(window: RollingWindow | undefined, n: number): number {
  if (!window || n <= 0) return 0;
  return window.volumes.slice(-n).filter((v) => v > 1e-9).length;
}

function pairKey(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

export function expectedCapacityLostFromShares(
  cardShares: number[],
  posShares: number[],
  scenario: Scenario,
): number {
  const cardHhi = hhi(cardShares.length ? cardShares : [1]);
  const posHhi = hhi(posShares.length ? posShares : [1]);
  const cardRho = clamp(scenario.cardFailureCorrelation, 0, 1);
  const posRho = clamp(scenario.posFailureCorrelation, 0, 1);
  const fCard = cardRho + (1 - cardRho) * cardHhi;
  const fPos = posRho + (1 - posRho) * posHhi;
  const scopeSum =
    scenario.interruptionIsCardScope +
    scenario.interruptionIsPosScope +
    scenario.interruptionIsSystemScope;
  if (scopeSum <= 0) return 1;
  const pCard = scenario.interruptionIsCardScope / scopeSum;
  const pPos = scenario.interruptionIsPosScope / scopeSum;
  const pSys = scenario.interruptionIsSystemScope / scopeSum;
  return Math.min(1, pSys * 1 + pCard * fCard + pPos * fPos);
}

function sharesFromVolumes(volumes: number[]): number[] {
  const total = sum(volumes);
  if (total <= 1e-9) return sharesFromWeights(volumes.map(() => 1));
  return volumes.map((v) => v / total);
}

function priorVolume(window: RollingWindow | undefined, priorDays: number): number {
  return volumeN(window, Math.max(0, priorDays));
}

function resourceTodayMap(plan: AllocationPlan, kind: "card" | "pos"): Record<string, number> {
  const ids = kind === "card" ? plan.cardIds : plan.posIds;
  const volumes = kind === "card" ? plan.cardVolumes : plan.posVolumes;
  return Object.fromEntries(ids.map((id, i) => [id, volumes[i] ?? 0]));
}

function rollingResourceVolumes(
  resources: Resource[],
  todayById: Record<string, number>,
  windowDays: number,
): number[] {
  const priorDays = Math.max(0, windowDays - 1);
  return resources.map((r) => priorVolume(r.rolling, priorDays) + (todayById[r.id] ?? 0));
}

function rollingPairVolumes(
  state: SimState,
  plan: AllocationPlan,
  windowDays: number,
): number[] {
  const priorDays = Math.max(0, windowDays - 1);
  const totals = new Map<string, number>();
  for (const rec of state.pairs) {
    totals.set(pairKey(rec.cardId, rec.posId), priorVolume(rec.rolling, priorDays));
  }
  for (const pair of plan.pairs) {
    const key = pairKey(pair.cardId, pair.posId);
    totals.set(key, (totals.get(key) ?? 0) + pair.amount);
  }
  return [...totals.values()].filter((v) => v > 1e-9);
}

function largestShare(volumes: number[]): number {
  if (volumes.length === 0) return 1;
  const total = sum(volumes);
  if (total <= 1e-9) return 1;
  return Math.max(...volumes) / total;
}

function meanOf(history: number[], window: number): number | null {
  if (history.length === 0) return null;
  const slice = history.slice(-window);
  if (slice.length === 0) return null;
  return sum(slice) / slice.length;
}

function boundedAcceleration(
  current: number,
  baseline: number | null,
  coldStartJump: number,
): number {
  if (baseline === null || baseline <= 0) {
    return current > 0 ? coldStartJump : 0;
  }
  return Math.max(0, current / baseline - 1);
}

export function systemRampIndex(state: SimState, scenario: Scenario, throughput: number): number {
  const hist = state.throughputHistory;
  const prev = hist.length > 0 ? hist[hist.length - 1]! : null;
  const avg7 = meanOf(hist, 7);
  const avg30 = meanOf(hist, 30);
  const rPrev = boundedAcceleration(throughput, prev, scenario.coldStartJump);
  const r7 = boundedAcceleration(throughput, avg7, scenario.coldStartJump);
  const r30 = boundedAcceleration(throughput, avg30, scenario.coldStartJump);
  const w = scenario.rampWeightPrevDay + scenario.rampWeight7d + scenario.rampWeight30d;
  if (w <= 0) return 0;
  return (
    (scenario.rampWeightPrevDay * rPrev + scenario.rampWeight7d * r7 + scenario.rampWeight30d * r30) / w
  );
}

/**
 * Resource-level ramp vs that resource's own recent average.
 * No baseline → 0, not the system cold-start jump: a newly installed POS is
 * not a system-wide acceleration, and using coldStartJump here would forbid
 * ever touching a new device.
 */
function resourceWindowRamp(resource: Resource, todayVolume: number, window: number): number {
  const prior = resource.rolling.volumes.slice(-window);
  if (prior.length === 0) return 0;
  const baseline = sum(prior) / prior.length;
  if (baseline <= 1e-9) return 0;
  return Math.max(0, todayVolume / baseline - 1);
}

function maxResourceRamp(resources: Resource[], todayById: Record<string, number>, window: number): number {
  let best = 0;
  for (const resource of resources) {
    const today = todayById[resource.id] ?? 0;
    if (today <= 1e-9) continue;
    best = Math.max(best, resourceWindowRamp(resource, today, window));
  }
  return best;
}

function rollingResourceActiveDays(
  resources: Resource[],
  todayById: Record<string, number>,
  windowDays: number,
): number[] {
  const priorDays = Math.max(0, windowDays - 1);
  return resources.map((r) => activeDaysN(r.rolling, priorDays) + ((todayById[r.id] ?? 0) > 1e-9 ? 1 : 0));
}

function rollingPairActiveDays(
  state: SimState,
  plan: AllocationPlan,
  windowDays: number,
): number[] {
  const priorDays = Math.max(0, windowDays - 1);
  const todayKeys = new Set(plan.pairs.filter((p) => p.amount > 1e-9).map((p) => pairKey(p.cardId, p.posId)));
  const counts: number[] = [];
  const seen = new Set<string>();
  for (const rec of state.pairs) {
    const key = pairKey(rec.cardId, rec.posId);
    seen.add(key);
    counts.push(activeDaysN(rec.rolling, priorDays) + (todayKeys.has(key) ? 1 : 0));
  }
  for (const pair of plan.pairs) {
    const key = pairKey(pair.cardId, pair.posId);
    if (seen.has(key)) continue;
    counts.push(pair.amount > 1e-9 ? 1 : 0);
  }
  return counts.filter((c) => c > 0);
}

function blendToday7_14(today: number, d7: number, d14: number): number {
  return 0.5 * today + 0.3 * d7 + 0.2 * d14;
}

/**
 * Use-frequency capacity-lost analogue: HHI of *days used*, not Rands.
 * Independent of volume. POS used 30/30 vs 12/30 at the same 30-day volume
 * are equal under volume concentration and different here.
 */
export function persistenceFromActiveDays(
  cardActiveDays: number[],
  posActiveDays: number[],
  scenario: Scenario,
): number {
  return expectedCapacityLostFromShares(
    sharesFromVolumes(cardActiveDays.map((d) => d)),
    sharesFromVolumes(posActiveDays.map((d) => d)),
    scenario,
  );
}

const OVERLAP_NOTES = [
  "Volume concentration (today / 7d / 14d / 30d) is HHI of Rands. Use-frequency persistence is the same f-structure on active-day counts. POS1 used 30/30 days at the same 30-day volume as 12/30 days is identical in volume f and different in persistence.",
  "Model B volume blend is 0.50 today + 0.30 7d + 0.20 14d. Persistence, when included, is a separate F_persist = 1 + persistenceSensitivity × frequency-f, not folded into concentrationSensitivity.",
  "consecutiveActiveDays is collinear with 7d/14d active-day share when a device is used every day; it is reported, not added on top of frequency-f.",
  "System ramp stays the only F_ramp input. Resource ramp remains diagnostic.",
];

export function emptyHazardDecomposition(
  model: ConcentrationModel = "today",
): HazardDecomposition {
  return {
    model,
    todayConcentration: 0,
    concentration7d: 0,
    concentration14d: 0,
    concentration30d: 0,
    todayRamp: 0,
    resourceRamp7d: 0,
    resourceRamp30d: 0,
    pairConcentrationToday: 0,
    pairConcentration7d: 0,
    pairConcentration14d: 0,
    pairConcentration30d: 0,
    combinedCardPosConcentration: 0,
    combinedPairConcentration: 0,
    combinedConcentrationInput: 0,
    combinedRampInput: 0,
    concentrationFactor: 1,
    rampFactor: 1,
    largestPosShare7d: 1,
    largestPosShare14d: 1,
    largestPairShare7d: 1,
    largestPairShare14d: 1,
    largestPairShare30d: 1,
    maxConsecutivePosDays: 0,
    maxConsecutivePairDays: 0,
    maxActiveDays7dPos: 0,
    maxActiveDays14dPos: 0,
    maxActiveDays30dPos: 0,
    persistenceInput: 0,
    persistenceFrequency7d: 0,
    persistenceFrequency14d: 0,
    persistenceFrequency30d: 0,
    persistenceFactor: 1,
    criticalPersistenceFactor: 1,
    survivingPosConsecutiveDays: 0,
    largestPosVolumeShare7d: 1,
    largestPosVolumeShare14d: 1,
    largestPosVolumeShare30d: 1,
    largestPosActiveShare7d: 1,
    largestPosActiveShare14d: 1,
    largestPosActiveShare30d: 1,
    largestPairActiveShare7d: 1,
    largestPairActiveShare14d: 1,
    largestPairActiveShare30d: 1,
    overlapNotes: OVERLAP_NOTES,
  };
}

export function decomposeHazard(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  observedThroughput: number,
): HazardDecomposition {
  const todayByCard = resourceTodayMap(plan, "card");
  const todayByPos = resourceTodayMap(plan, "pos");
  const todayConc = expectedCapacityLostFromShares(plan.cardShares, plan.posShares, scenario);
  const c7 = expectedCapacityLostFromShares(
    sharesFromVolumes(rollingResourceVolumes(state.cards, todayByCard, 7)),
    sharesFromVolumes(rollingResourceVolumes(state.pos, todayByPos, 7)),
    scenario,
  );
  const c14 = expectedCapacityLostFromShares(
    sharesFromVolumes(rollingResourceVolumes(state.cards, todayByCard, 14)),
    sharesFromVolumes(rollingResourceVolumes(state.pos, todayByPos, 14)),
    scenario,
  );
  const c30 = expectedCapacityLostFromShares(
    sharesFromVolumes(rollingResourceVolumes(state.cards, todayByCard, 30)),
    sharesFromVolumes(rollingResourceVolumes(state.pos, todayByPos, 30)),
    scenario,
  );

  const pairToday = hhi(plan.pairs.map((p) => p.share).filter((s) => s > 0).length ? plan.pairs.map((p) => p.share) : [1]);
  const pair7 = hhi(sharesFromVolumes(rollingPairVolumes(state, plan, 7)));
  const pair14 = hhi(sharesFromVolumes(rollingPairVolumes(state, plan, 14)));
  const pair30 = hhi(sharesFromVolumes(rollingPairVolumes(state, plan, 30)));

  const todayRamp = systemRampIndex(state, scenario, observedThroughput);

  const used = [...state.cards, ...state.pos];
  const todayById = { ...todayByCard, ...todayByPos };
  const resourceRamp7d = maxResourceRamp(used, todayById, 7);
  const resourceRamp30d = maxResourceRamp(used, todayById, 30);

  const cardPosBlend = blendToday7_14(todayConc, c7, c14);
  const pairBlend = blendToday7_14(pairToday, pair7, pair14);

  const model = scenario.concentrationModel;
  let combinedCardPos = todayConc;
  let combinedPair = pairToday;
  let combinedInput = todayConc;
  if (model === "rolling-card-pos" || model === "rolling-card-pos-pair") {
    combinedCardPos = cardPosBlend;
    combinedInput = cardPosBlend;
  }
  if (model === "rolling-card-pos-pair") {
    combinedPair = pairBlend;
    combinedInput = Math.max(cardPosBlend, pairBlend);
  }

  const combinedRamp = todayRamp;
  const concentrationFactor = 1 + scenario.concentrationSensitivity * combinedInput;
  const rampFactor = 1 + scenario.rampSensitivity * combinedRamp;

  const posVol7 = rollingResourceVolumes(state.pos, todayByPos, 7);
  const posVol14 = rollingResourceVolumes(state.pos, todayByPos, 14);
  const posVol30 = rollingResourceVolumes(state.pos, todayByPos, 30);
  const pairVol7 = rollingPairVolumes(state, plan, 7);
  const pairVol14 = rollingPairVolumes(state, plan, 14);
  const pairVol30 = rollingPairVolumes(state, plan, 30);
  const pairAct7 = rollingPairActiveDays(state, plan, 7);
  const pairAct14 = rollingPairActiveDays(state, plan, 14);
  const pairAct30 = rollingPairActiveDays(state, plan, 30);

  const cardAct7 = rollingResourceActiveDays(state.cards, todayByCard, 7);
  const posAct7 = rollingResourceActiveDays(state.pos, todayByPos, 7);
  const cardAct14 = rollingResourceActiveDays(state.cards, todayByCard, 14);
  const posAct14 = rollingResourceActiveDays(state.pos, todayByPos, 14);
  const cardAct30 = rollingResourceActiveDays(state.cards, todayByCard, 30);
  const posAct30 = rollingResourceActiveDays(state.pos, todayByPos, 30);

  const persist7 = persistenceFromActiveDays(cardAct7, posAct7, scenario);
  const persist14 = persistenceFromActiveDays(cardAct14, posAct14, scenario);
  const persist30 = persistenceFromActiveDays(cardAct30, posAct30, scenario);
  const persistenceInput = 0.5 * persist7 + 0.3 * persist14 + 0.2 * persist30;
  const persistenceFactor = scenario.includePersistenceInHazard
    ? 1 + scenario.persistenceSensitivity * persistenceInput
    : 1;

  const previewConsecutive = (rec: { rolling: RollingWindow }, today: number) =>
    today > 1e-9 ? rec.rolling.consecutiveActiveDays + 1 : 0;

  const upPos = state.pos.filter((p) => p.downUntilDay === null || p.downUntilDay <= state.day);
  const downCount = state.pos.length - upPos.length;
  const kappa = Math.max(0, scenario.criticalPersistenceSensitivity ?? 0);
  let survivingPosConsecutiveDays = 0;
  let criticalPersistenceFactor = 1;
  if (kappa > 1e-12 && upPos.length === 1 && downCount >= 1) {
    const survivor = upPos[0]!;
    const todayVol = todayByPos[survivor.id] ?? 0;
    survivingPosConsecutiveDays =
      todayVol > 1e-9 ? survivor.rolling.consecutiveActiveDays + 1 : survivor.rolling.consecutiveActiveDays;
    const input = Math.min(1, Math.max(0, survivingPosConsecutiveDays / 5));
    criticalPersistenceFactor = 1 + kappa * input;
  }

  return {
    model,
    todayConcentration: todayConc,
    concentration7d: c7,
    concentration14d: c14,
    concentration30d: c30,
    todayRamp,
    resourceRamp7d,
    resourceRamp30d,
    pairConcentrationToday: pairToday,
    pairConcentration7d: pair7,
    pairConcentration14d: pair14,
    pairConcentration30d: pair30,
    combinedCardPosConcentration: combinedCardPos,
    combinedPairConcentration: combinedPair,
    combinedConcentrationInput: combinedInput,
    combinedRampInput: combinedRamp,
    concentrationFactor,
    rampFactor,
    largestPosShare7d: largestShare(posVol7),
    largestPosShare14d: largestShare(posVol14),
    largestPairShare7d: largestShare(pairVol7),
    largestPairShare14d: largestShare(pairVol14),
    largestPairShare30d: largestShare(pairVol30),
    maxConsecutivePosDays: Math.max(
      0,
      ...state.pos.map((p) => previewConsecutive(p, todayByPos[p.id] ?? 0)),
    ),
    maxConsecutivePairDays: Math.max(
      0,
      ...state.pairs.map((p) =>
        previewConsecutive(p, plan.pairs.find((x) => x.cardId === p.cardId && x.posId === p.posId)?.amount ?? 0),
      ),
      ...plan.pairs.map((p) => {
        const rec = state.pairs.find((x) => x.cardId === p.cardId && x.posId === p.posId);
        return rec ? previewConsecutive(rec, p.amount) : p.amount > 1e-9 ? 1 : 0;
      }),
    ),
    maxActiveDays7dPos: Math.max(0, ...posAct7),
    maxActiveDays14dPos: Math.max(0, ...posAct14),
    maxActiveDays30dPos: Math.max(0, ...posAct30),
    persistenceInput,
    persistenceFrequency7d: persist7,
    persistenceFrequency14d: persist14,
    persistenceFrequency30d: persist30,
    persistenceFactor,
    criticalPersistenceFactor,
    survivingPosConsecutiveDays,
    largestPosVolumeShare7d: largestShare(posVol7),
    largestPosVolumeShare14d: largestShare(posVol14),
    largestPosVolumeShare30d: largestShare(posVol30),
    largestPosActiveShare7d: largestShare(posAct7),
    largestPosActiveShare14d: largestShare(posAct14),
    largestPosActiveShare30d: largestShare(posAct30),
    largestPairActiveShare7d: largestShare(pairAct7),
    largestPairActiveShare14d: largestShare(pairAct14),
    largestPairActiveShare30d: largestShare(pairAct30),
    overlapNotes: OVERLAP_NOTES,
  };
}

export function concentrationInputFromPlan(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  observedThroughput: number,
): number {
  return decomposeHazard(state, scenario, plan, observedThroughput).combinedConcentrationInput;
}

/** Cover ranking metric: volume concentration, plus persistence when that term is in the hazard. */
export function coverMetricFromPlan(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  observedThroughput: number,
): { volume: number; persistence: number; metric: number } {
  const d = decomposeHazard(state, scenario, plan, observedThroughput);
  const persistence = d.persistenceInput;
  const volume = d.combinedConcentrationInput;
  return {
    volume,
    persistence,
    metric: scenario.includePersistenceInHazard ? volume + persistence : volume,
  };
}

export function fillRollingFromDailyVolumes(window: RollingWindow, dailyVolumes: number[]): void {
  window.volumes = [];
  window.counts = [];
  window.consecutiveActiveDays = 0;
  window.daysSinceLastUse = 0;
  for (const v of dailyVolumes) {
    pushRolling(window, v, v > 0 ? 1 : 0);
  }
}

export function recordDayOnResources(
  resources: Resource[],
  volumeById: Record<string, number>,
  ticketsById: Record<string, number>,
): void {
  for (const resource of resources) {
    pushRolling(resource.rolling, volumeById[resource.id] ?? 0, ticketsById[resource.id] ?? 0);
  }
}

export function recordDayOnPairs(
  pairs: PairRecord[],
  volumeByKey: Record<string, number>,
  countByKey: Record<string, number>,
): void {
  for (const rec of pairs) {
    const key = pairKey(rec.cardId, rec.posId);
    pushRolling(rec.rolling, volumeByKey[key] ?? 0, countByKey[key] ?? 0);
  }
}
