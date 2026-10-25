/**
 * Bank-email authentication beyond Resend's Svix signature.
 * Sender allow-list alone is never enough — ARC/DKIM must pass and align
 * with the claimed bank domain.
 */

export type BankIssuerId = 'moza' | 'fnb_mz' | 'fnb_za' | 'capitec'

export type AllowedBankSender = {
  email: string
  issuer: BankIssuerId
  /** Domains that may appear in a passing DKIM/ARC d= tag. */
  dkimDomains: string[]
}

/** Exact From address allow-list (lowercased local@domain). */
export const ALLOWED_BANK_SENDERS: AllowedBankSender[] = [
  {
    email: 'info@mozabanco.co.mz',
    issuer: 'moza',
    dkimDomains: ['mozabanco.co.mz'],
  },
  {
    email: 'ebanka@fnb.co.mz',
    issuer: 'fnb_mz',
    dkimDomains: ['fnb.co.mz'],
  },
  {
    email: 'noreply@fnb.co.za',
    issuer: 'fnb_za',
    dkimDomains: ['fnb.co.za'],
  },
  {
    email: 'donotreply@fnb.co.za',
    issuer: 'fnb_za',
    dkimDomains: ['fnb.co.za'],
  },
  /** Card/account SMS-style notices: spend, reversals, Speedpoint POS credits. */
  {
    email: 'incontact@fnb.co.za',
    issuer: 'fnb_za',
    dkimDomains: ['fnb.co.za'],
  },
  /** PDF conversion receipts ("FNB Receipt"). */
  {
    email: 'noreplytransreport@fnb.co.za',
    issuer: 'fnb_za',
    dkimDomains: ['fnb.co.za'],
  },
  {
    email: 'noreply@capitecbank.co.za',
    issuer: 'capitec',
    dkimDomains: ['capitecbank.co.za'],
  },
]

export type BankAuthInput = {
  from: string | null
  /** Header map — values may be strings or arrays (Resend/SES multi-value). */
  headers: Record<string, string | string[]> | null
  authentication: { spf?: unknown; dkim?: unknown; dmarc?: unknown } | null
}

export type BankAuthResult =
  | {
      ok: true
      issuer: BankIssuerId
      senderEmail: string
      dkimDomain: string
    }
  | {
      ok: false
      reason:
        | 'missing_from'
        | 'sender_not_allowlisted'
        | 'dkim_arc_missing'
        | 'dkim_arc_failed'
        | 'dkim_domain_misaligned'
    }

export function extractSenderEmail(from: string | null | undefined): string | null {
  if (!from) return null
  const angled = from.match(/<([^>]+)>/)
  const email = (angled ? angled[1] : from).trim().toLowerCase()
  return email.includes('@') ? email : null
}

function authResultString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.toLowerCase()
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    if (typeof row.result === 'string') return row.result.toLowerCase()
    if (typeof row.status === 'string') return row.status.toLowerCase()
  }
  return null
}

function headerValueToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((row) => headerValueToString(row)).join('\n')
  return String(value)
}

function headerBlob(headers: Record<string, string | string[]> | null | undefined): string {
  if (!headers) return ''
  const preferred = ['arc-authentication-results', 'authentication-results', 'dkim-signature']
  const parts: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    if (preferred.includes(key.toLowerCase())) parts.push(`${key}: ${headerValueToString(value)}`)
  }
  // Fall back to full header dump when preferred keys are absent.
  if (!parts.length) {
    for (const [key, value] of Object.entries(headers)) {
      parts.push(`${key}: ${headerValueToString(value)}`)
    }
  }
  return parts.join('\n')
}

/**
 * Find a DKIM/ARC pass whose d= / header.i= domain is in the allow-list for this sender.
 * Accepts Gmail ARC chain results (mx.google.com) that still report dkim=pass
 * for the bank domain — including header.i=@bank.example (Gmail/SES style).
 */
export function findAlignedDkimPass(
  headers: Record<string, string | string[]> | null | undefined,
  authentication: BankAuthInput['authentication'],
  allowedDomains: string[]
): { pass: true; domain: string } | { pass: false; reason: 'dkim_arc_missing' | 'dkim_arc_failed' | 'dkim_domain_misaligned' } {
  const allowed = new Set(allowedDomains.map((d) => d.toLowerCase()))
  const blob = headerBlob(headers)
  const passes: Array<{ domain: string }> = []

  // Authentication-Results / ARC:
  //   dkim=pass header.d=bank.example
  //   dkim=pass header.i=@bank.example  (Gmail ARC + Amazon SES)
  const resultRe =
    /dkim\s*=\s*pass\b[^;\n]*?(?:header\.d|header\.i|d)\s*=\s*@?([A-Za-z0-9.-]+)/gi
  let match: RegExpExecArray | null
  while ((match = resultRe.exec(blob))) {
    passes.push({ domain: match[1]!.toLowerCase() })
  }

  // DKIM-Signature d= tag only counts when Authentication-Results also says pass,
  // or when Resend authentication.dkim.result === pass.
  const dkimAuth = authResultString(authentication?.dkim)
  if (dkimAuth === 'pass') {
    const sigDomains = [...blob.matchAll(/\bd\s*=\s*([A-Za-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase())
    for (const domain of sigDomains) {
      if (allowed.has(domain)) passes.push({ domain })
    }
    // Resend already verified DKIM; Gmail forwards often only keep header.i=@bank.
    const identityDomains = [...blob.matchAll(/header\.i\s*=\s*@?([A-Za-z0-9.-]+)/gi)].map((m) =>
      m[1]!.toLowerCase()
    )
    for (const domain of identityDomains) {
      if (allowed.has(domain)) passes.push({ domain })
    }
  }

  if (!passes.length) {
    if (dkimAuth && dkimAuth !== 'pass') return { pass: false, reason: 'dkim_arc_failed' }
    if (/dkim\s*=\s*(fail|neutral|softfail|temperror|permerror)/i.test(blob)) {
      return { pass: false, reason: 'dkim_arc_failed' }
    }
    return { pass: false, reason: 'dkim_arc_missing' }
  }

  const aligned = passes.find((row) => allowed.has(row.domain))
  if (!aligned) return { pass: false, reason: 'dkim_domain_misaligned' }
  return { pass: true, domain: aligned.domain }
}

export function evaluateBankAuthentication(input: BankAuthInput): BankAuthResult {
  const senderEmail = extractSenderEmail(input.from)
  if (!senderEmail) return { ok: false, reason: 'missing_from' }

  const allowed = ALLOWED_BANK_SENDERS.find((row) => row.email === senderEmail)
  if (!allowed) return { ok: false, reason: 'sender_not_allowlisted' }

  const dkim = findAlignedDkimPass(input.headers, input.authentication, allowed.dkimDomains)
  if (!dkim.pass) return { ok: false, reason: dkim.reason }

  return {
    ok: true,
    issuer: allowed.issuer,
    senderEmail,
    dkimDomain: dkim.domain,
  }
}

export function isAllowedBankSender(from: string | null | undefined): boolean {
  const email = extractSenderEmail(from)
  return Boolean(email && ALLOWED_BANK_SENDERS.some((row) => row.email === email))
}
