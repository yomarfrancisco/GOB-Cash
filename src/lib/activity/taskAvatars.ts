/** Unique faces for live payment activity. Each action keeps one avatar. */

export const TASK_AVATARS = {
  /** Align convert faces with FX Desk bank liaisons / routing manager. */
  convertMzn: '/assets/MZN_square.jpg',
  convertZar: '/assets/ZAR_square.jpg',
  deposit: '/assets/avatar - profile (4).png',
  withdraw: '/assets/avatar - profile (2).png',
  cashAgent: '/assets/benjamin_grey_square.png',
  paymentSent: '/assets/avatar - profile (3).png',
  paymentDelivered: '/assets/ZAR_square.jpg',
  paymentReceived: '/assets/MZN_square.jpg',
} as const

export function conversionAvatar(sourceCurrency: 'MZN' | 'ZAR' | string | undefined): string {
  return sourceCurrency === 'ZAR' ? TASK_AVATARS.convertZar : TASK_AVATARS.convertMzn
}

export function conversionAvatarKind(sourceCurrency: 'MZN' | 'ZAR'): 'convert_zar' | 'convert_mzn' {
  return sourceCurrency === 'ZAR' ? 'convert_zar' : 'convert_mzn'
}
