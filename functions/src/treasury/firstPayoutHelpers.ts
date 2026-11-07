/** Pure helpers for the sub-R100k first-payout flow (no Firebase). */

export function looksLikeBankDetails(message: string): boolean {
  const text = message.trim()
  if (text.length < 12) return false
  const hasDigits = /\d{6,}/.test(text.replace(/\s/g, ''))
  const hasBank =
    /\b(fnb|capitec|absa|nedbank|standard\s*bank|investec|tyme|discovery\s*bank|african\s*bank|bank\s*zero|sa\s*bank|account)\b/i.test(
      text
    )
  const hasHolder = /\b(account\s*holder|account\s*name|beneficiary|name\s*:)\b/i.test(text)
  return hasDigits && (hasBank || hasHolder || /\b\d{8,}\b/.test(text.replace(/\s/g, '')))
}

export function parseZarPayoutSubject(subject: string): string | null {
  const match = subject.trim().match(/^ZAR\s+Payout\s+@?([A-Za-z0-9._-]+)\s*$/i)
  if (!match) return null
  return match[1].trim().replace(/^@+/, '').toLowerCase()
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}
