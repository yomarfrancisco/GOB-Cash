/**
 * Record a realised MZN/ZAR rate (digital or photo/manual).
 *
 * Cursor / operator examples:
 *   npx ts-node --transpile-only scripts/recordRealisedRate.ts \
 *     --bank moza --zar 10500 --mzn 43748.54 \
 *     --source cursor_manual --notes "balance photo before/after"
 *
 *   npx ts-node --transpile-only scripts/recordRealisedRate.ts \
 *     --bank bci --zar 8000 --mzn 32440 --source balance_photo \
 *     --observedAt 2026-10-19T12:00:00.000Z
 */
import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  issuingBankLabelFromBankId,
  normalizeIssuingBankId,
  recordRealisedRate,
  type RealisedRateSource,
} from '../src/fx/realisedRates'

const PROJECT = 'gobankless-dev'

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx < 0 || idx + 1 >= process.argv.length) return null
  return process.argv[idx + 1]!
}

function ensureAdc() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return
  const adc = path.join(
    os.homedir(),
    '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
  )
  if (fs.existsSync(adc)) process.env.GOOGLE_APPLICATION_CREDENTIALS = adc
}

async function main() {
  ensureAdc()
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT })

  const bankRaw = arg('bank')
  const zar = Number(arg('zar'))
  const mzn = Number(arg('mzn'))
  const source = (arg('source') || 'cursor_manual') as RealisedRateSource
  if (!bankRaw || !(zar > 0) || !(mzn > 0)) {
    console.error('Usage: --bank moza|bci|bim|fnb_mz|standard_mz --zar N --mzn N [--source cursor_manual|balance_photo|…]')
    process.exit(1)
  }

  const bankId = normalizeIssuingBankId(bankRaw)
  const result = await recordRealisedRate(admin.firestore(), {
    issuingBank: arg('issuingBank') || issuingBankLabelFromBankId(bankId),
    bankId,
    amountZar: zar,
    amountMzn: mzn,
    source,
    observedAt: arg('observedAt'),
    apiMid: arg('apiMid') ? Number(arg('apiMid')) : null,
    canonicalCardId: arg('card'),
    evidenceId: arg('evidenceId'),
    eventId: arg('eventId'),
    notes: arg('notes'),
    id: arg('id'),
  })

  console.log(JSON.stringify({ created: result.created, observation: result.observation }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
