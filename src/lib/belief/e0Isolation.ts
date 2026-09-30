export function isE0PreviewPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/desk/e0' || pathname.startsWith('/desk/e0/')
}

export const E0_FIXTURE_NAMESPACE = 'e0_preview_fixture_v1' as const

export const E0_ISOLATION = {
  readsProductionRouteEvidence: false,
  writesEvidence: false,
  mutatesInvoicesWalletsRoutesDecisions: false,
  callsLivePlanner: false,
  callsLlm: false,
  usesProductionBankMail: false,
  source: 'deterministic_in_memory_fixture',
  namespace: E0_FIXTURE_NAMESPACE,
} as const
