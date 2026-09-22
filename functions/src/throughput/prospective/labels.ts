const SLUG_LABEL: Record<string, string> = {
  bim: 'BIM',
  fnb: 'FNB',
  bci: 'BCI',
  vista: 'Vista',
  standard: 'Standard Bank',
  capitec: 'Capitec',
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatInstitutionLabel(institutionId: string | null | undefined, allIds: string[]): string | null {
  if (!institutionId) return null
  if (!institutionId.includes('.')) return institutionId
  const [region, slug] = institutionId.split('.')
  if (!slug) return institutionId
  const base = SLUG_LABEL[slug] ?? titleCase(slug)
  const bothRegions = allIds.some((id) => {
    const [otherRegion, otherSlug] = id.split('.')
    return otherSlug === slug && otherRegion !== region
  })
  if (slug === 'fnb' || bothRegions) {
    if (region === 'mz') return `${base} Mozambique`
    if (region === 'za') return `${base} South Africa`
  }
  return base
}

export function shortSaBankLabel(institutionLabel: string | null | undefined): string {
  if (!institutionLabel) return 'Rail'
  return institutionLabel.replace(/ South Africa$/, '').replace(/ Mozambique$/, '')
}

export function formatRailLabel(posId: string, institutionLabel: string | null | undefined): string {
  const n = posId.match(/(\d+)$/)?.[1]
  const bank = shortSaBankLabel(institutionLabel)
  return n ? `Rail ${n} ${bank}` : bank
}
