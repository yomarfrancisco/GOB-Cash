/**
 * SA beneficiary compliance packs for residual EFT instruct emails.
 * Files live under functions/assets/company-docs/<companyId>/.
 * Only attach registration + tax notice when present for that entity.
 */

import * as fs from 'fs'
import * as path from 'path'

export type ComplianceDocKind = 'registration' | 'tax'

export type ComplianceDocRef = {
  kind: ComplianceDocKind
  /** Path relative to functions/assets/company-docs/ */
  relativePath: string
  /** Filename shown on the email attachment */
  filename: string
}

/**
 * Lemon: COR14.3 includes CIPC tax number 9169211290 on the certificate.
 * No standalone SARS Notice of Registration was supplied in this pack.
 */
const BY_COMPANY: Record<string, ComplianceDocRef[]> = {
  lemon_economics: [
    {
      kind: 'registration',
      relativePath: 'lemon_economics/COR14.3_Registration.pdf',
      filename: 'Lemon_Economics_COR14.3_Registration.pdf',
    },
  ],
  econometrica: [
    {
      kind: 'registration',
      relativePath: 'econometrica/CIPC_CoR15.1A.pdf',
      filename: 'Econometrica_CIPC_CoR15.1A.pdf',
    },
    {
      kind: 'tax',
      relativePath: 'econometrica/SARS_TaxNumber.pdf',
      filename: 'Econometrica_SARS_TaxNumber.pdf',
    },
  ],
  wolf_and_sons: [
    {
      kind: 'registration',
      relativePath: 'wolf_and_sons/CIPC_Registration_Pack.pdf',
      filename: 'Wolf_and_Sons_CIPC_Registration.pdf',
    },
    {
      kind: 'tax',
      relativePath: 'wolf_and_sons/SARS_TaxNumber.pdf',
      filename: 'Wolf_and_Sons_SARS_TaxNumber.pdf',
    },
  ],
  imani: [
    {
      kind: 'registration',
      relativePath: 'imani/COR14.3_Registration.pdf',
      filename: 'Imani_COR14.3_Registration.pdf',
    },
    {
      kind: 'tax',
      relativePath: 'imani/SARS_TaxNumber.pdf',
      filename: 'Imani_SARS_TaxNumber.pdf',
    },
  ],
}

function resolveCompanyDocsDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../assets/company-docs'),
    path.join(process.cwd(), 'assets/company-docs'),
    path.join(process.cwd(), 'functions/assets/company-docs'),
  ]
  return candidates.find((dir) => fs.existsSync(dir)) || null
}

export function listComplianceDocsForCompany(companyId: string): ComplianceDocRef[] {
  return BY_COMPANY[companyId] || []
}

export type LoadedComplianceAttachment = {
  filename: string
  content: string // base64
  kind: ComplianceDocKind
}

/** Load registration (+ tax when on file) for the SA beneficiary. Missing files are skipped. */
export function loadComplianceAttachmentsForCompany(companyId: string): LoadedComplianceAttachment[] {
  const root = resolveCompanyDocsDir()
  if (!root) return []
  const out: LoadedComplianceAttachment[] = []
  for (const doc of listComplianceDocsForCompany(companyId)) {
    const full = path.join(root, doc.relativePath)
    if (!fs.existsSync(full)) continue
    out.push({
      filename: doc.filename,
      content: fs.readFileSync(full).toString('base64'),
      kind: doc.kind,
    })
  }
  return out
}
