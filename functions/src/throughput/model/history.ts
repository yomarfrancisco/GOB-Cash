import type { Resource, ResourceHistorySeed, Scenario, SimState } from "./types";

export function emptyHistorySeed(): ResourceHistorySeed {
  return {
    ageDays: 0,
    historicalTxCount: 0,
    historicalVolumeZar: 0,
    activeDays: 0,
    cleanHistoryDays: 0,
    reviewCount: 0,
  };
}

/** History that saturates the default maturity scales without being a coefficient change. */
export function establishedHistorySeed(): ResourceHistorySeed {
  return {
    ageDays: 90,
    historicalTxCount: 80,
    historicalVolumeZar: 400_000,
    activeDays: 40,
    cleanHistoryDays: 45,
    reviewCount: 0,
  };
}

export function partialHistorySeed(): ResourceHistorySeed {
  return {
    ageDays: 45,
    historicalTxCount: 20,
    historicalVolumeZar: 80_000,
    activeDays: 15,
    cleanHistoryDays: 20,
    reviewCount: 0,
  };
}

export function applyHistorySeed(resource: Resource, seed: ResourceHistorySeed | null | undefined): void {
  if (!seed) return;
  resource.daysActive = Math.max(0, seed.ageDays);
  resource.lifetimeCount = Math.max(0, seed.historicalTxCount);
  resource.lifetimeVolume = Math.max(0, seed.historicalVolumeZar);
  resource.activeTradingDays = Math.max(0, seed.activeDays);
  resource.cleanHistoryDays = Math.max(0, seed.cleanHistoryDays);
  resource.interruptionCount = Math.max(0, seed.reviewCount);
  resource.importedHistoryVolume = Math.max(0, seed.historicalVolumeZar);
  resource.importedHistoryCount = Math.max(0, seed.historicalTxCount);
}

export function seedForIndex(
  fallback: ResourceHistorySeed,
  overrides: Array<ResourceHistorySeed | null>,
  index: number,
): ResourceHistorySeed {
  return overrides[index] ?? fallback;
}

export function applyMerchantHistory(state: SimState, scenario: Scenario): void {
  if (scenario.startingMerchantHistory) {
    const seed = scenario.startingMerchantHistory;
    state.merchantDaysActive = Math.max(0, seed.ageDays);
    state.merchantLifetimeCount = Math.max(0, seed.historicalTxCount);
    state.merchantLifetimeVolume = Math.max(0, seed.historicalVolumeZar);
    state.merchantActiveTradingDays = Math.max(0, seed.activeDays);
    state.merchantCleanHistoryDays = Math.max(0, seed.cleanHistoryDays);
    state.merchantInterruptionCount = Math.max(0, seed.reviewCount);
    return;
  }
  if (state.cards.length === 0) return;
  state.merchantDaysActive = Math.max(...state.cards.map((c) => c.daysActive));
  state.merchantLifetimeCount = state.cards.reduce((s, c) => s + c.lifetimeCount, 0);
  state.merchantLifetimeVolume = state.cards.reduce((s, c) => s + c.lifetimeVolume, 0);
  state.merchantActiveTradingDays = Math.max(...state.cards.map((c) => c.activeTradingDays));
  state.merchantCleanHistoryDays = Math.min(...state.cards.map((c) => c.cleanHistoryDays));
  state.merchantInterruptionCount = Math.max(...state.cards.map((c) => c.interruptionCount));
}
