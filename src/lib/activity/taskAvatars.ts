/** Unique faces for live payment activity. Each action keeps one avatar. */

export const TASK_AVATARS = {
  convertMzn: '/assets/Brics-girl-blue.png',
  convertZar: '/assets/avatar-ariel.png',
  deposit: '/assets/avatar - profile (4).png',
  withdraw: '/assets/avatar - profile (2).png',
  cashAgent: '/assets/avatar - profile (1).png',
  paymentSent: '/assets/avatar - profile (3).png',
  paymentDelivered: '/assets/avatar_agent3.png',
  paymentReceived: '/assets/avatar_agent6.png',
  copied: '/assets/avatar - profile (5).png',
} as const

export function conversionAvatar(sourceCurrency: 'MZN' | 'ZAR' | string | undefined): string {
  return sourceCurrency === 'ZAR' ? TASK_AVATARS.convertZar : TASK_AVATARS.convertMzn
}

export function conversionAvatarKind(sourceCurrency: 'MZN' | 'ZAR'): 'convert_zar' | 'convert_mzn' {
  return sourceCurrency === 'ZAR' ? 'convert_zar' : 'convert_mzn'
}
