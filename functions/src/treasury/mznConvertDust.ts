import { roundMajor } from './reserveBooks'

/** FX rounding leftover after MZN→ZAR (e.g. Mt 0.01 when ZAR was rounded to cents). */
export const MZN_CONVERT_DUST = 0.05

export type LiquidNowMode = 'full' | 'partial' | 'none'

/**
 * When an instant convert already took the ZAR cents for this balance, absorb
 * sub-cent MZN leftovers into the debit so wallets don't show Mt 0.01 queued.
 */
export function absorbMznConvertDust(params: {
  mznBalance: number
  instantMzn: number
  instantZar: number
}): { instantMzn: number; residualMzn: number; mode: LiquidNowMode } {
  const mznBalance = roundMajor(Math.max(0, params.mznBalance))
  const instantZar = roundMajor(params.instantZar)
  let instantMzn = roundMajor(params.instantMzn)
  let residualMzn = roundMajor(Math.max(0, mznBalance - instantMzn))

  if (instantZar > 0.005 && residualMzn > 0 && residualMzn <= MZN_CONVERT_DUST) {
    instantMzn = mznBalance
    residualMzn = 0
  }

  const mode: LiquidNowMode =
    instantZar > 0.005 && residualMzn <= 0.005
      ? 'full'
      : instantZar > 0.005
        ? 'partial'
        : 'none'

  return { instantMzn, residualMzn, mode }
}
