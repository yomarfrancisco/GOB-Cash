/**
 * Ensure HTTPS callables allow unauthenticated invoke (Firebase Auth still required
 * inside the function). Without allUsers invoker, clients get a generic 403/internal.
 *
 *   cd functions && npx tsx scripts/ensureCallableInvokers.ts [fnName ...]
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { GoogleAuth } from 'google-auth-library'

const adcCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(os.homedir(), '.config/gcloud/application_default_credentials.json'),
  path.join(
    os.homedir(),
    '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
  ),
].filter((value): value is string => Boolean(value))
for (const candidate of adcCandidates) {
  if (fs.existsSync(candidate)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = candidate
    break
  }
}

const PROJECT = 'gobankless-dev'
const REGION = 'us-central1'
const DEFAULT_FNS = [
  'desk_savePayoutAccountAndPay',
  'desk_submitPayoutBankDetails',
  'ops_confirmFirstPayout',
]

async function ensureInvoker(client: { request: (opts: Record<string, unknown>) => Promise<{ data: unknown }> }, fn: string) {
  const name = `projects/${PROJECT}/locations/${REGION}/functions/${fn}`
  const getUrl = `https://cloudfunctions.googleapis.com/v1/${name}:getIamPolicy`
  const getRes = await client.request({ url: getUrl, method: 'GET' })
  const policy = (getRes.data || { bindings: [] }) as {
    bindings?: Array<{ role: string; members: string[] }>
    etag?: string
    version?: number
  }
  const bindings = Array.isArray(policy.bindings) ? [...policy.bindings] : []
  const role = 'roles/cloudfunctions.invoker'
  let binding = bindings.find((b) => b.role === role)
  if (!binding) {
    binding = { role, members: [] }
    bindings.push(binding)
  }
  if (binding.members.includes('allUsers')) {
    console.log(fn, 'already has allUsers invoker')
    return
  }
  binding.members = [...binding.members, 'allUsers']
  const setUrl = `https://cloudfunctions.googleapis.com/v1/${name}:setIamPolicy`
  await client.request({
    url: setUrl,
    method: 'POST',
    data: { policy: { ...policy, bindings } },
  })
  console.log(fn, 'granted allUsers invoker')
}

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const names = process.argv.slice(2)
  const fns = names.length ? names : DEFAULT_FNS
  for (const fn of fns) {
    await ensureInvoker(client, fn)
  }
}

main().catch((e) => {
  console.error(e?.response?.data || e)
  process.exit(1)
})
