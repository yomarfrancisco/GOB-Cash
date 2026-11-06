/**
 * Capitec settlement / receipt PDFs are locked with the merchant settlement
 * bank account number. Keep every active Capitec merchant account here and in
 * CAPITEC_PDF_PASSWORD (comma / whitespace separated).
 */
export const CAPITEC_ACCOUNT_PDF_PASSWORDS = [
  '1055571175', // BRICS AI
  '1055902139', // ECONOMETRICA
] as const

/** Merge secret value with known account passwords (deduped, secret first). */
export function capitecPdfPasswordList(secretValue?: string | null): string[] {
  const fromSecret = String(secretValue || '')
    .split(/[\s,;]+/)
    .map((row) => row.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const pw of [...fromSecret, ...CAPITEC_ACCOUNT_PDF_PASSWORDS]) {
    if (seen.has(pw)) continue
    seen.add(pw)
    out.push(pw)
  }
  return out
}
