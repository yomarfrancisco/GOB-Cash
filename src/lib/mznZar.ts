export const MZN_PER_ZAR = 4.5
export const ZAR_PER_USDT = 18.1

export const mznToZar = (amountMZN: number, rateMZNperZAR = MZN_PER_ZAR) =>
  Math.round((amountMZN / rateMZNperZAR) * 100) / 100

export const zarToMzn = (amountZAR: number, rateMZNperZAR = MZN_PER_ZAR) =>
  amountZAR * rateMZNperZAR

export const zarToUsdt = (amountZAR: number) => amountZAR / ZAR_PER_USDT
