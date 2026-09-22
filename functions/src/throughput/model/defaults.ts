import type { MaturityWeights, Scenario } from "./types";

export const ILLUSTRATIVE_NOTE =
  "Illustrative scenario input — not an empirical estimate of bank behaviour.";

const balancedWeights: MaturityWeights = {
  age: 0.15,
  count: 0.25,
  volume: 0.2,
  activeDays: 0.2,
  clean: 0.2,
};

export const PARAMETER_TOOLTIPS: Record<string, string> = {
  startingCapitalZar:
    "Working capital available to deploy as daily throughput at the start of the scenario.",
  startingCapitalMzn:
    "Labeled MZN equivalent of starting capital. Display only; the optimizer uses ZAR.",
  margin:
    "Gross margin earned on each successful Rand of throughput. 0.10 means 10%.",
  capitalMode:
    "Fixed-capital extracts profit and keeps deployable capital at the starting level. Reinvest adds successful profit to future deployable capital.",
  p0: `${ILLUSTRATIVE_NOTE} Daily interruption hazard when throughput equals the reference level and all continuity factors equal 1.`,
  vRefZar:
    "Throughput level at which the base hazard equals p0 (before continuity factors). Makes gamma interpretable.",
  gamma: `${ILLUSTRATIVE_NOTE} Controls how quickly assumed review risk increases as daily throughput rises. Higher values make aggressive scaling more costly.`,
  hMax: "Upper bound on daily interruption probability after the saturating transform. Prevents factor products from exceeding 100%.",
  shortReviewMinDays:
    "Lower end of the short-review duration range, in operating days assumed lost on the interrupted share of capacity.",
  shortReviewMaxDays:
    "Upper end of the short-review duration range.",
  longReviewMinDays:
    "Lower end of a severe review. Number of operating days assumed lost in that scenario, on the interrupted share.",
  longReviewMaxDays:
    "Upper end of a severe review duration.",
  probabilityReviewIsLong: `${ILLUSTRATIVE_NOTE} Conditional probability that an interruption is a long review rather than a short one.`,
  merchantProfileFit:
    "How well assumed activity fits the stated business profile. 0.75 = unusually strong fit, 1.00 = neutral, 1.50 = some mismatch, 2.00+ = substantial mismatch. Scenario input, not inferred.",
  merchantMaturitySensitivity:
    "How strongly a thin merchant history raises hazard. State (0–1 score) is separate from this coefficient.",
  cardMaturitySensitivity:
    "How strongly thin card history raises hazard. A 60-day card with 7 transactions is not automatically mature.",
  concentrationSensitivity:
    "How much extra hazard is attached to putting throughput through few resources, on top of the direct capacity-loss fraction.",
  rampSensitivity:
    "How much recent acceleration in throughput raises assumed continuity risk.",
  useLookahead:
    "When on, today’s choice maximises a rolling L-day policy rollout (today’s myopic EV plus the continuation the production policy would actually follow). The horizon does not collapse to one day merely because some volume already exists. When off, only today’s myopic EV is maximised. Organic expense is scheduled from the entitlement stock; organic revenue is still 0-vs-full under the active objective.",
  lookaheadDays:
    "Rollout horizon in calendar days. Later days re-select actions from the projected state. This is not one future daily value multiplied by L.",
  capitalFrozenDuringReview:
    "When on, an interruption locks the interrupted share of working capital so it cannot be moved to healthy resources or extracted until release.",
  frozenCapitalDailyRate: `${ILLUSTRATIVE_NOTE} Extra daily economic cost per locked Rand, beyond lost turnover. Captures lost optionality of idle/safe cash.`,
  showOperatingBand:
    "When on, report every throughput step whose objective EV is within the tolerance of the point optimum, so illustrative parameters are not mistaken for a precise Rand amount.",
  bandEvTolerance:
    "Relative EV gap used to build the operating band. 0.08 means all candidates within 8% of the best EV (and with non-negative EV) are in-band.",
  showBreakEvenHazard:
    "When on, invert the myopic EV identity at the recommended V to show the interruption hazard at which that V would be worth zero.",
  riskConstraintEnabled:
    "When on, discard candidates that breach the downtime or 30-day long-review probability limits, then maximise EV among the rest.",
  maxExpectedDowntimeShare:
    "Maximum expected lost operating days per calendar day allowed for a candidate. 0.25 means the model will not pick a V whose expected downtime exceeds a quarter of a day per day.",
  maxProbLongReview30d:
    "Maximum scenario probability of at least one long review over a 30-day window, using 1−(1−h·q)^30.",
  initialCards: "How many cards are installed on Day 1. Names are listed separately. Extra cards beyond the named list are labelled Card 6, Card 7, …",
  initialCardNames:
    "Day-1 card names, in install order. Default: BRICS, Ginav, Vidrotec, Wolf, Goblin. Later arrivals use generic names until configured otherwise.",
  initialPos: "POS devices installed on Day 1. New devices start Thin with no history.",
  maximumPosDevices:
    "Cap on POS devices. Arrivals stop once this count is reached. Default 5.",
  posEveryDays:
    "POS arrivals after every N completed days (Day 8, 15, 22, … when N=7), until the maximum POS count.",
  cardEveryDays:
    "Card arrivals after every N completed days (Day 61, 121, … when N=60). New cards start Thin.",
  perCardCapacityZar: "Physical daily throughput a single up card can handle. Does not grant maturity; Thin cards can still physically transact.",
  perPosCapacityZar: "Physical daily throughput a single up POS can handle.",
  horizonDays: "Calendar length of the simulation.",
  throughputStepZar: "Grid step for candidate daily throughput. Zero is always included.",
  avgTicketZar: "Typical genuine ticket size. Realized sizes are drawn in the configured range; expected lookahead days use this amount.",
  expectedTicketMinZar: "Lower end of the ticket range consistent with the configured merchant profile.",
  expectedTicketMaxZar: "Upper end of the ticket range consistent with the configured merchant profile.",
  meanDailyCoreTickets:
    "Poisson mean of genuine core tickets arriving on a weekday. The policy may execute any subset, including none. Weekends have no arrivals. Not a target transaction count.",
  weeklyEnsemblePaths:
    "Number of seeded Monday–Friday realizations used for weekly operating-policy medians. Inner policy is myopic for speed; the displayed week uses the production lookahead path.",
  crossBorderProfile: "Direct multiplier for cross-border / FX-profile uncertainty. 1.00 = neutral.",
  relatedPartyContext: "Direct multiplier for related-party / relationship-context uncertainty. 1.00 = neutral.",
  posMaturitySensitivity: "How strongly thin POS history raises hazard. Separate from the 0–1 POS maturity state.",
  ticketFitSensitivity: "How strongly a ticket outside the expected range raises hazard.",
  priorReviewSensitivity: "How strongly prior interruptions raise hazard. Cold start has none.",
  cleanHistorySensitivity: "How strongly a short clean-history duration raises hazard.",
  cardFailureCorrelation:
    "Share of a card-scoped interruption that hits all cards together. 0 = independent card failures; 1 = any card event takes every card. Five named cards are not five independent failure domains.",
  posFailureCorrelation:
    "Share of a POS-scoped interruption that hits all POS devices together. 0 = independent device failures; 1 = any POS event takes every device.",
  interruptionIsCardScope: "Relative weight that a review is card-scoped.",
  interruptionIsPosScope: "Relative weight that a review is POS-scoped.",
  interruptionIsSystemScope: "Relative weight that a review disables the whole system.",
  lossModel:
    "Severity model for an interruption. legacy = closed-form lost turnover + locked-capital carry (plus the rollout's hit branch). eventBased = one event state machine (failure domain → dependence-weighted target → in-flight capital locked → resource-aware capacity → ticket fates), valued once. No production default has been chosen for eventBased.",
  lossDomainProbabilities: `${ILLUSTRATIVE_NOTE} Conditional probability of each failure domain given an interruption (pair, card, POS, merchant account, issuer/institution, full system). MODEL HYPOTHESES, not issuer evidence.`,
  deferralCostDailyRate: `${ILLUSTRATIVE_NOTE} Time / liquidity cost per Rand of deferred genuine demand per operating day held. Deferred demand keeps its margin unless it expires.`,
  rerouteCostPerTicketZar: `${ILLUSTRATIVE_NOTE} Genuine operational cost of executing a ticket on a resource other than the one planned (re-keying, re-documentation).`,
  ticketMaxDeferralOperatingDays: `${ILLUSTRATIVE_NOTE} Operating days a genuine ticket can wait in the backlog before it expires and its margin is lost once.`,
  settlementLagDays: `${ILLUSTRATIVE_NOTE} Calendar days executed volume stays unsettled (in flight). Only in-flight volume on the affected resources is locked by an interruption.`,
  coldStartJump: "Bounded acceleration used when there is no history. Prevents divide-by-zero ramp penalties.",
  rampWeightPrevDay: "Weight on yesterday vs today when scoring ramp / acceleration.",
  rampWeight7d: "Weight on the 7-day average when scoring ramp.",
  rampWeight30d: "Weight on the 30-day average when scoring ramp.",
  conservativeThroughputZar: "Fixed daily throughput used as the conservative comparison policy.",
  monteCarloPaths: "Number of sampled interruption paths. Higher is slower and more stable.",
  rngSeed: "Seed for Monte Carlo. Same seed and scenario reproduce the same draws.",
  merchantMaturityStateOverride:
    "Optional override of the merchant maturity STATE (0–1), not the coefficient. Leave empty to use simulated history.",
  cardMaturityStateOverride:
    "Optional override of the card maturity STATE (0–1), not the coefficient. Leave empty to use simulated history.",
  startingCardHistory:
    "Imported pre-strategy history applied to each Day-1 card unless a per-card override is set. Age/count/volume/active/clean/reviews. Zero means a fully cold card.",
  startingPosHistory:
    "Imported pre-strategy history applied to each Day-1 POS unless overridden. POS can be mature while cards are cold, and vice versa.",
  externalOrganicRevenueMonthlyZar:
    "Genuine external monthly revenue the businesses already earn, independent of core throughput. Evenly offered across days of a 30-day month; unused remainder rolls within the month and expires at month end. Not created by the optimiser.",
  weeklyExpenseFloorZar:
    "Known weekly genuine expense floor (default R5,000). Accrues at floor/7 per day as a minimum entitlement rate. Unused expense budget rolls forward; it does not expire at week end. Spend timing is chosen by expenseTimingPolicy; the optimiser does not create extra spend.",
  monthlyProfitLinkedExpenseRate:
    "Share of yesterday’s gross profit that becomes extra expense entitlement today. Default 25%. Day-t profit cannot raise Day-t expense capacity.",
  organicMonthLengthDays: "Length of the organic revenue / profit-linked expense accounting month in simulation days. Default 30.",
  organicWeekLengthDays: "Length of the organic expense-floor week in simulation days. Default 7.",
  concentrationModel:
    "Which concentration state enters F_concentration. today = current-day card/POS only (Model A). rolling-card-pos = 0.50 today + 0.30 7d + 0.20 14d card/POS (Model B). rolling-card-pos-pair = Model B plus pair windows via max() (Model C). The coefficient is unchanged; feeding it extra state is still an effective risk-function change.",
  expenseTimingPolicy:
    "When genuine expense entitlement becomes observed spend. threshold = current R5k lump. distributed = most days, bounded by the floor rate and a 14-day drain of stock. mixed = recurring / weekly / occasional fractions of the same entitlement. After the cadence baseline, the optimiser may bring forward already-accrued stock if the L-day objective improves. Totals stay inside the stock.",
  pairTieBreak:
    "How economically equivalent pair covers are ranked. history = prefer high lifetime-volume pairs (the old sticky default). neutral = identity order, no volume preference. low-dependency = prefer lower recent use-frequency, while still penalising unnecessary new pairs.",
  includePersistenceInHazard:
    "When off, use-frequency (days used) is diagnostic only. Volume concentration then treats POS1 used 30/30 days as equivalent to the same 30-day volume used 12/30 days. When on, persistence is a separate hazard factor; p0/γ/maturity are unchanged.",
  persistenceSensitivity:
    "Coefficient on the use-frequency persistence input. Only applied when includePersistenceInHazard is on. Not a retune of p0, γ, or maturity.",
  pairOperatingCostZar:
    "Operational cost, in Rands of cover-ranking EV, for each pair beyond one per card. Stops a full card×POS cartesian from winning unless the multi-day value of that density exceeds the cost. Not a retune of p0 or γ.",
  newPairCostZar:
    "First-day cost of a card×POS pair with no history. Later days do not keep paying it. The allocator opens that pair only if the multi-day cover value exceeds this plus any new-POS cost.",
  newPosCostZar:
    "First-day cost of routing volume onto a POS with no lifetime volume. Installed devices stay optional; this is not a mandate to use every POS.",
  hotPosUseCostZar:
    "Allocation-only cost for still using the current hottest POS, scaled by that device’s consecutive and 7-day active days. Makes resting that device compete with new-pair cost. Does not enter production F_persist, p0, or γ.",
  coverMixEnabled:
    "When on, today’s cover is chosen from a feasible set: 2/3/4 cards from today’s V, no pair from the last operating day, no 3rd consecutive operating day on a card. Lookahead re-chooses a legal cover tomorrow instead of holding the same keys. Not added to h(V) or 180-day CA.",
  coverThinThroughputZar:
    "Core volume below this targets 2 cards. Never 1 card. Eligibility (resting cards) can reduce the count further.",
  coverFatThroughputZar:
    "Core volume at or above this targets 4 cards. Between the thin and fat cuts, target 3. Never “use every installed card because they exist.”",
  coverMaxConsecutiveOperatingDays:
    "A card that has been used this many consecutive operating weekdays is ineligible the next operating day. Weekends do not reset the streak.",
  valueOfInformationEnabled:
    "When on, packed actions are ranked by Q_economic + VOI_resource (+ VOI_config if enabled). IV is expected future economic value from reducing uncertainty. Provisional kernel scales are not calibrated. IV is not added to h(V) or the 180-day continuity-adjusted total.",
  voiConfigurationEnabled:
    "When on with value-of-information, add configuration-level VOI (mix / scale / recent history), separate from per-card/POS independent-capacity VOI. Illustrative kernel parameters, not empirically fitted.",
  voiKernelLogV: `${ILLUSTRATIVE_NOTE} Provisional RBF length scale on log10 throughput. Not calibrated.`,
  voiKernelTx: `${ILLUSTRATIVE_NOTE} Provisional length scale on packed ticket count. Not calibrated.`,
  voiKernelCards: `${ILLUSTRATIVE_NOTE} Provisional length scale on realized card count. Not calibrated.`,
  voiKernelPos: `${ILLUSTRATIVE_NOTE} Provisional length scale on realized POS count. Not calibrated.`,
  voiKernelPairs: `${ILLUSTRATIVE_NOTE} Provisional length scale on realized pair count. Not calibrated.`,
  voiKernelHhi: `${ILLUSTRATIVE_NOTE} Provisional length scale on pair HHI. Not calibrated.`,
  voiKernelMaxShare: `${ILLUSTRATIVE_NOTE} Provisional length scale on largest card/POS share. Not calibrated.`,
  voiKernelActive7: `${ILLUSTRATIVE_NOTE} Provisional length scale on 7-day active count. Not calibrated.`,
  voiKernelActive14: `${ILLUSTRATIVE_NOTE} Provisional length scale on 14-day active count. Not calibrated.`,
  voiKernelIdle: `${ILLUSTRATIVE_NOTE} Provisional length scale on consecutive idle business days. Not calibrated.`,
  voiKernelTime: `${ILLUSTRATIVE_NOTE} Provisional length scale on morning/afternoon bucket. Not calibrated.`,
  voiNStarResource: `${ILLUSTRATIVE_NOTE} Provisional N* for resource κ=N/(N+N*). Not calibrated.`,
  voiNStarConfig: `${ILLUSTRATIVE_NOTE} Provisional N* for configuration κ. Not calibrated.`,
  voiPriorSigmaResZar: `${ILLUSTRATIVE_NOTE} Provisional prior σ (Rands/day) for resource-channel stakes. Not calibrated.`,
  voiPriorSigmaCfgZar: `${ILLUSTRATIVE_NOTE} Provisional prior σ (Rands/day) of configuration outcome residual. Not calibrated.`,
  economicLearnerEnabled:
    "Production policy: θ̃ ~ posterior once per realized day, then a* = argmax_a Q_base(s,a) + Δ_G(s,a | θ̃) over feasible packed actions (including R0). Δ_G is a gross-economic residual (fraction of gross × configuration and card/POS effects). It never enters h(V), continuity cost, or the recorded continuity-adjusted EV. Exploration is whatever the posterior makes competitive; no rotation, bonus, or target card count.",
  learnerPriorSigmaConfig:
    "Prior σ, as a fraction of gross profit, on each configuration coefficient (intercept, log V, tickets, cards, POS, extra pairs, largest card / POS share, idle run-up). Pre-registered; the hidden world draws θ*_econ from this same prior in the matched class.",
  learnerPriorSigmaCard:
    "Prior σ (fraction of gross, share-weighted) on each card's economic effect. Unseen cards inherit the population prior with full σ until observed.",
  learnerPriorSigmaPos:
    "Prior σ (fraction of gross, share-weighted) on each POS's economic effect.",
  learnerNoiseFraction:
    "Observation noise σ_ε = c_ε × gross profit. Sets how much one realized day moves the posterior. Too small ⇒ over-confident after a few days; too large ⇒ near-frozen prior.",
  hiddenWorldEnabled:
    "Offline testing only. Realized gross outcomes are y = Q_base + Δ*(s,a; θ*_econ) + ε, and a genuine interruption draw uses h_true = m*(V; θ*_cont) × h_structural. The agent never sees θ*. Off in production: observations then come from the real ledger through the same log.",
  hiddenWorldSeed:
    "Seed for θ*_econ, θ*_cont and outcome noise. Independent of rngSeed so the same demand is faced by every policy in every world.",
  hiddenWorldClass:
    "matched: θ*_econ is drawn from the agent's own prior (tests whether the learner recovers what it can express). misspecified: adds a ≥4-card threshold effect and pair-specific effects the agent cannot express (tests robustness).",
  hiddenEconomicSigmaScale:
    "Multiplies the prior σ when drawing θ*_econ. 1 = matched. >1 makes the world larger than the agent believes; <1 smaller.",
  hiddenContinuityLogSigma:
    "σ of the hidden log-multiplier intercept on hazard: h_true = exp(c0 + c1·log(V/Vref)) × h_structural. 0 means the structural hazard is exactly right. Separate from θ*_econ so economic and continuity recovery are tested independently.",
  hiddenContinuitySlopeSigma:
    "σ of the hidden slope c1 on log(V/Vref) in the continuity multiplier.",
  continuityPriorStrength:
    "Gamma(α0, α0) prior on the continuity multiplier m (prior mean 1). Posterior m | K hits, exposure E ~ Gamma(α0+K, α0+E). α0 = 20 means about 20 expected structural hits of evidence are needed before data dominate. Sparse data therefore cannot recalibrate on their own.",
  usePosteriorContinuityCalibration:
    "Off (v1): h_structural is the production risk function; the continuity posterior is diagnostic only. On: production hazard becomes h_post = m̂ × h_structural with m̂ the posterior mean. Enable only with sufficient genuine production interruption evidence. Δ_G never compensates for continuity errors either way.",
  bankRulesEnabled:
    "Bank Operating Rules / Feasibility Layer. On: hard issuer constraints run on the realized packed plan before Q_base, Thompson ranking, rolling-Q or MPC. A plan that violates a hard rule never receives economic, continuity, VOI or Thompson credit. Off: the previous packer and organic water-fill are used unchanged (comparison baseline).",
  maxEligiblePurchasesPerCardPerDay:
    "HARD ISSUER CONSTRAINT (bank: “do not use the same card twice a day”). Applies across core, organic revenue and organic expense on the realized plan. Bank guidance is 1; a higher value is a deliberate departure from the guidance.",
  requiresPinPresent:
    "HARD ISSUER CONSTRAINT (bank: “PIN must show all the time”). A candidate is feasible only on a POS with cardPresentFlow and pinCapableFlow. Execution prerequisite, not a claim that the transaction is approved or low-risk.",
  documentationRequired:
    "HARD ISSUER CONSTRAINT (bank: “keep supplier invoices”). A genuine payment without a supporting invoice on file is infeasible for automatic execution and is listed as blocked: supporting invoice missing.",
  declineBlocksCardForDays:
    "HARD ISSUER CONSTRAINT (bank: “do not re-purchase a declined card”). 0 = the bank wording: the declined card never retries that economic payment. A positive value additionally blocks the card for any purchase for N days — a MODEL EXTENSION beyond the bank wording, labelled as such.",
  repeatedAmountPolicy:
    "HARD ISSUER CONSTRAINT (bank: “do not use the same amount recurringly”). A genuine payment whose identical amount already appears in the window is marked bankRuleReviewRequired. allow-with-invoice: executes (flagged) only when a supporting invoice is present, otherwise deferred. defer: always deferred for operator review. Amounts are never randomised, padded or split.",
  highValueThresholdZar:
    "BANKER-IDENTIFIED FEATURE (“payments above R10,000 are considered high value”). amount > threshold sets highValue. Not a ban; tracked as 1d / 7d / 14d count, volume and share and available to the structural hazard through the provisional coefficient.",
  initialCardOrigins:
    "BANKER-IDENTIFIED FEATURE (“no local cards / transactions can be a flag”). Origin of each Day-1 card. Missing entries default to international. Zero local activity is reported explicitly; the model never manufactures local transactions.",
  repeatedAmountWindowDays: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: look-back window for the repeated-amount check. The bank gave no window.`,
  repeatWeightSameDay: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: w1 — weight on “card used on the previous operating day” in cardRepeatExposure = (w1·usedPrevOpDay + w7·activeShare7d + w14·activeShare14d)/(w1+w7+w14). Also weights the same-day-repeat diagnostic on attempted infeasible plans (always 0 on executable plans under rule 5). Banker: repeat use of the same card is a flag; the banker gave no windows or weights.`,
  repeatWeight7d: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: w7 — weight on the card's active share of operating days in the prior 7 days. The banker did not specify a 7-day window. Require w1 > w7 > w14.`,
  repeatWeight14d: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: w14 — weight on the card's active share over the prior 14 days. The banker did not specify a 14-day window.`,
  pairRepeatWeightPrevDay: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: p1 — weight on “same card × same POS pair used on the previous operating day” in pairRepeatExposure = (p1·pairUsedPrevOpDay + p7·pairActiveShare7d + p14·pairActiveShare14d)/(p1+p7+p14). Same card, same POS ≠ same card, different POS: this is repeated use of the same relationship. Require p1 > p7 > p14.`,
  pairRepeatWeight7d: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: p7 — weight on the pair's active share of operating days in the prior 7 days.`,
  pairRepeatWeight14d: `${ILLUSTRATIVE_NOTE} MODEL HYPOTHESIS: p14 — weight on the pair's active share over the prior 14 days.`,
  highValueSensitivity: `${ILLUSTRATIVE_NOTE} PROVISIONAL COEFFICIENT (uncalibrated): F_highValue = 1 + c × highValueShare1d. 0 = diagnostic only; existing coefficients are not retuned.`,
  repeatCardSensitivity: `${ILLUSTRATIVE_NOTE} PROVISIONAL COEFFICIENT (uncalibrated): F_card_repeat = 1 + c_card × cardRepeatExposure (exposure ∈ [0,1], volume-weighted over today's cards). Consecutive-day reuse is not prohibited; the optimizer pays this continuity cost and decides whether reuse is still worth it. Set 0 for diagnostic only. Not merged into the concentration coefficient.`,
  repeatPairSensitivity: `${ILLUSTRATIVE_NOTE} PROVISIONAL COEFFICIENT (uncalibrated): F_pair_repeat = 1 + c_pair × pairRepeatExposure (exposure ∈ [0,1], volume-weighted over today's pairs). Same card × same POS normally carries the stronger persistence signal, so the default is above the card coefficient. Set 0 for diagnostic only.`,
  localMixSensitivity: `${ILLUSTRATIVE_NOTE} PROVISIONAL COEFFICIENT (uncalibrated): F_localMix = 1 + c × (1 − localVolumeShare14d). 0 = diagnostic only.`,
};

export const DEFAULT_INITIAL_CARD_NAMES = [
  "BRICS",
  "Ginav",
  "Vidrotec",
  "Wolf",
  "Goblin",
] as const;

export function cardNamesForCount(
  count: number,
  configured: readonly string[] = DEFAULT_INITIAL_CARD_NAMES,
): string[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => configured[i] ?? `Card ${i + 1}`);
}

export function createDefaultScenario(): Scenario {
  return {
    name: "Balanced (defaults)",
    preset: "balanced",

    startingCapitalZar: 100_000,
    startingCapitalMzn: 400_000,
    margin: 0.1,
    capitalMode: "fixed",

    initialCards: 5,
    initialCardNames: [...DEFAULT_INITIAL_CARD_NAMES],
    initialPos: 3,
    posEveryDays: 7,
    cardEveryDays: 60,
    maximumPosDevices: 5,
    perCardCapacityZar: 100_000,
    perPosCapacityZar: 100_000,

    horizonDays: 180,
    throughputStepZar: 5_000,
    avgTicketZar: 2_500,
    expectedTicketMinZar: 1_000,
    expectedTicketMaxZar: 8_000,
    meanDailyCoreTickets: 4,
    weeklyEnsemblePaths: 16,

    p0: 0.002,
    vRefZar: 20_000,
    gamma: 2,
    hMax: 0.85,
    infiniteHazardAboveZar: null,

    shortReviewMinDays: 1,
    shortReviewMaxDays: 3,
    longReviewMinDays: 35,
    longReviewMaxDays: 42,
    probabilityReviewIsLong: 0.2,
    interruptionIsCardScope: 0.5,
    interruptionIsPosScope: 0.3,
    interruptionIsSystemScope: 0.2,
    cardFailureCorrelation: 0.25,
    posFailureCorrelation: 0.25,

    // Interruption-loss model. "legacy" is the production behaviour; "eventBased" is under
    // evaluation and has no production default yet. Domain probabilities are HYPOTHESES.
    lossModel: "legacy",
    lossDomainProbabilities: { pair: 0.15, card: 0.45, pos: 0.2, merchant: 0.1, institution: 0.05, system: 0.05 },
    deferralCostDailyRate: 0.001,
    rerouteCostPerTicketZar: 20,
    ticketMaxDeferralOperatingDays: 5,
    settlementLagDays: 1,
    eventLossAblation: {
      backlog: true,
      resourceAwareCapacity: true,
      posFailureDomain: true,
      accountContagion: true,
      operatingDayDistinction: true,
      removeSeverityDoubleCount: true,
    },

    merchantProfileFit: 1.5,
    crossBorderProfile: 1,
    relatedPartyContext: 1,

    merchantMaturitySensitivity: 1.2,
    cardMaturitySensitivity: 1.2,
    posMaturitySensitivity: 0.6,
    concentrationSensitivity: 0.8,
    rampSensitivity: 0.35,
    ticketFitSensitivity: 0.5,
    priorReviewSensitivity: 0.4,
    cleanHistorySensitivity: 0.5,

    merchantMaturityWeights: { ...balancedWeights },
    cardMaturityWeights: { ...balancedWeights },
    posMaturityWeights: { ...balancedWeights },

    merchantAgeDaysToMature: 90,
    merchantCountToMature: 80,
    merchantVolumeToMature: 400_000,
    merchantActiveDaysToMature: 40,
    merchantCleanDaysToMature: 45,

    cardAgeDaysToMature: 90,
    cardCountToMature: 80,
    cardVolumeToMature: 400_000,
    cardActiveDaysToMature: 40,
    cardCleanDaysToMature: 45,

    posAgeDaysToMature: 60,
    posCountToMature: 80,
    posVolumeToMature: 400_000,
    posActiveDaysToMature: 30,
    posCleanDaysToMature: 30,

    thinMax: 0.33,
    developingMax: 0.67,

    rampWeightPrevDay: 0.5,
    rampWeight7d: 0.3,
    rampWeight30d: 0.2,
    coldStartJump: 1,

    useLookahead: true,
    lookaheadDays: 14,
    capitalFrozenDuringReview: true,
    frozenCapitalDailyRate: 0.002,
    showOperatingBand: true,
    bandEvTolerance: 0.08,
    showBreakEvenHazard: true,

    riskConstraintEnabled: false,
    maxExpectedDowntimeShare: 0.25,
    maxProbLongReview30d: 0.35,

    conservativeThroughputZar: 10_000,
    monteCarloPaths: 1000,
    rngSeed: 14,

    merchantMaturityStateOverride: null,
    cardMaturityStateOverride: null,

    startingCardHistory: {
      ageDays: 0,
      historicalTxCount: 0,
      historicalVolumeZar: 0,
      activeDays: 0,
      cleanHistoryDays: 0,
      reviewCount: 0,
    },
    startingPosHistory: {
      ageDays: 0,
      historicalTxCount: 0,
      historicalVolumeZar: 0,
      activeDays: 0,
      cleanHistoryDays: 0,
      reviewCount: 0,
    },
    startingCardHistories: [],
    startingPosHistories: [],
    startingMerchantHistory: null,

    externalOrganicRevenueMonthlyZar: 40_000,
    weeklyExpenseFloorZar: 5_000,
    monthlyProfitLinkedExpenseRate: 0.25,
    organicMonthLengthDays: 30,
    organicWeekLengthDays: 7,
    concentrationModel: "today",
    expenseTimingPolicy: "threshold",
    pairTieBreak: "neutral",
    includePersistenceInHazard: false,
    persistenceSensitivity: 0.8,
    criticalPersistenceSensitivity: 0,
    degradedMaxPosShare: null,
    nMinusOneRetentionMin: null,
    nMinusOneMaxPosShareLimit: null,
    posExposureLockScale: null,
    posExposureWindowDays: 7,
    pairOperatingCostZar: 120,
    newPairCostZar: 10,
    newPosCostZar: 40,
    hotPosUseCostZar: 8,
    coverMixEnabled: false,
    coverThinThroughputZar: 12_000,
    coverFatThroughputZar: 20_000,
    coverMaxConsecutiveOperatingDays: 2,
    valueOfInformationEnabled: false,
    voiConfigurationEnabled: true,
    voiKernelLogV: 0.35,
    voiKernelTx: 3,
    voiKernelCards: 1,
    voiKernelPos: 0.8,
    voiKernelPairs: 1.2,
    voiKernelHhi: 0.4,
    voiKernelMaxShare: 0.25,
    voiKernelActive7: 3,
    voiKernelActive14: 4,
    voiKernelIdle: 2,
    voiKernelTime: 1,
    voiNStarResource: 6,
    voiNStarConfig: 4,
    voiPriorSigmaResZar: 200,
    voiPriorSigmaCfgZar: 400,
    economicLearnerEnabled: true,
    learnerPriorSigmaConfig: 0.04,
    learnerPriorSigmaCard: 0.05,
    learnerPriorSigmaPos: 0.03,
    learnerNoiseFraction: 0.06,
    hiddenWorldEnabled: true,
    hiddenWorldSeed: 7,
    hiddenWorldClass: "matched",
    hiddenEconomicSigmaScale: 1,
    hiddenContinuityLogSigma: 0.35,
    hiddenContinuitySlopeSigma: 0.2,
    continuityPriorStrength: 20,
    usePosteriorContinuityCalibration: false,

    bankRulesEnabled: true,
    maxEligiblePurchasesPerCardPerDay: 1,
    requiresPinPresent: true,
    documentationRequired: true,
    declineBlocksCardForDays: 0,
    repeatedAmountPolicy: "allow-with-invoice",
    highValueThresholdZar: 10_000,
    initialCardOrigins: [],
    repeatedAmountWindowDays: 30,
    repeatWeightSameDay: 1,
    repeatWeight7d: 0.5,
    repeatWeight14d: 0.25,
    pairRepeatWeightPrevDay: 1,
    pairRepeatWeight7d: 0.5,
    pairRepeatWeight14d: 0.25,
    highValueSensitivity: 0,
    // Provisional (illustrative / uncalibrated) persistence prices so the optimizer pays for
    // nearby-day reuse rather than treating it as free. Pair > card: same relationship. The
    // bank-rules comparison sweeps 0× / 0.5× / 1× / 2× of these.
    repeatCardSensitivity: 0.4,
    repeatPairSensitivity: 0.8,
    localMixSensitivity: 0,
  };
}

export function conservativeScenario(): Scenario {
  const s = createDefaultScenario();
  s.name = "Conservative";
  s.preset = "conservative";
  s.p0 = 0.0035;
  s.gamma = 2.4;
  s.probabilityReviewIsLong = 0.3;
  s.merchantProfileFit = 1.8;
  s.merchantMaturitySensitivity = 1.6;
  s.cardMaturitySensitivity = 1.6;
  s.concentrationSensitivity = 1.1;
  s.bandEvTolerance = 0.12;
  s.riskConstraintEnabled = true;
  return s;
}

export function aggressiveScenario(): Scenario {
  const s = createDefaultScenario();
  s.name = "Aggressive";
  s.preset = "aggressive";
  s.p0 = 0.001;
  s.gamma = 1.4;
  s.probabilityReviewIsLong = 0.12;
  s.merchantProfileFit = 1.2;
  s.merchantMaturitySensitivity = 0.8;
  s.cardMaturitySensitivity = 0.8;
  s.concentrationSensitivity = 0.45;
  s.useLookahead = true;
  s.riskConstraintEnabled = false;
  return s;
}

export function cloneScenario(scenario: Scenario): Scenario {
  return structuredClone(scenario);
}

/** Previous resource footprint: one generic card, one POS, uncapped POS growth. Same economic coefficients. */
export function legacyOneCardOnePosScenario(base: Scenario = createDefaultScenario()): Scenario {
  const s = cloneScenario(base);
  s.name = "Old: 1 card / 1 POS";
  s.preset = "custom";
  s.initialCards = 1;
  s.initialCardNames = ["Card 1"];
  s.initialPos = 1;
  s.maximumPosDevices = 99;
  return s;
}
