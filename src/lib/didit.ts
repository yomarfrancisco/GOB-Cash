export const DIDIT_KYC_WORKFLOW_ID = 'ddbab46a-d544-4907-9cfe-997a18245e6a'

/** Visual default on the profile bar before KYC starts. */
export const DEFAULT_COMPLIANCE_PERCENT = 22.4

/** KYC + AML workflow modules, in typical completion order. */
export const KYC_PROGRESS_MODULE_KEYS = [
  'id_verifications',
  'liveness_checks',
  'face_matches',
  'aml_screenings',
  'ip_analyses',
] as const

const KYC_PROGRESS_FEATURES = new Set(['OCR', 'LIVENESS', 'FACE_MATCH', 'AML', 'IP_ANALYSIS'])

export type DiditSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Awaiting User'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired'

function isProgressedModuleStatus(status: string): boolean {
  return status === 'Approved' || status === 'In Review'
}

function countCompletedModules(decision: unknown): number {
  if (!decision || typeof decision !== 'object') return 0
  const d = decision as Record<string, unknown>

    if (Array.isArray(d.features) && d.features.length > 0) {
    const seen = new Set<string>()
    for (const item of d.features) {
      if (!item || typeof item !== 'object') continue
      const feature = String((item as { feature?: unknown }).feature || '')
      const status = String((item as { status?: unknown }).status || '')
      if (KYC_PROGRESS_FEATURES.has(feature) && isProgressedModuleStatus(status)) {
        seen.add(feature)
      }
    }
    return seen.size
  }

  let done = 0
  for (const key of KYC_PROGRESS_MODULE_KEYS) {
    const arr = d[key]
    if (!Array.isArray(arr)) continue
    if (arr.some((item) => item && typeof item === 'object' && isProgressedModuleStatus(String((item as { status?: unknown }).status || '')))) {
      done += 1
    }
  }
  return done
}

export function computeCompliancePercent(input: {
  sessionStatus?: string | null
  decision?: unknown
}): number {
  const status = input.sessionStatus || ''
  if (!status) return DEFAULT_COMPLIANCE_PERCENT
  if (status === 'Approved') return 100
  if (status === 'Declined') return 20
  if (status === 'Kyc Expired' || status === 'Expired') return DEFAULT_COMPLIANCE_PERCENT
  if (status === 'Abandoned') return 35
  if (status === 'In Review') return 90

  const done = countCompletedModules(input.decision)
  const total = KYC_PROGRESS_MODULE_KEYS.length
  const floor = status === 'Resubmitted' ? 50 : 40
  return Math.min(90, Math.round(floor + (done / total) * 50))
}

/** In-progress scores never drop; terminal failures / expiry may. */
export function nextCompliancePercent(
  previous: unknown,
  computed: number,
  sessionStatus?: string | null,
): number {
  const status = sessionStatus || ''
  const canDrop =
    status === 'Declined' ||
    status === 'Expired' ||
    status === 'Kyc Expired' ||
    status === 'Abandoned'
  const prev = typeof previous === 'number' && Number.isFinite(previous) ? previous : null
  if (!canDrop && prev != null && computed < prev) return Math.max(0, Math.min(100, prev))
  return Math.max(0, Math.min(100, computed))
}
