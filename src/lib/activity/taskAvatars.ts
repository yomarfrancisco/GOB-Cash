/** Unique faces for live payment activity. Each action keeps one avatar. */

export const TASK_AVATARS = {
  /** Align convert faces with FX Desk bank liaisons / routing manager. */
  convertMzn: '/assets/mozambique.png',
  convertZar: '/assets/south-africa.png',
  deposit: '/assets/avatar - profile (4).png',
  withdraw: '/assets/avatar - profile (2).png',
  cashAgent: '/assets/benjamin_pink_circle.png',
  paymentSent: '/assets/avatar - profile (3).png',
  paymentDelivered: '/assets/south-africa.png',
  paymentReceived: '/assets/mozambique.png',
} as const

export function conversionAvatar(sourceCurrency: 'MZN' | 'ZAR' | string | undefined): string {
  return sourceCurrency === 'ZAR' ? TASK_AVATARS.convertZar : TASK_AVATARS.convertMzn
}

export function conversionAvatarKind(sourceCurrency: 'MZN' | 'ZAR'): 'convert_zar' | 'convert_mzn' {
  return sourceCurrency === 'ZAR' ? 'convert_zar' : 'convert_mzn'
}
