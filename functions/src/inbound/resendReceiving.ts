import { mapReceivingPayload, type ReceivingClient } from './bankMailPure'

const RECEIVING = 'https://api.resend.com/emails/receiving'

async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error('download_failed')
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new Error('too_large')
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const step = await reader.read()
    if (step.done) break
    const chunk = Buffer.from(step.value)
    total += chunk.length
    if (total > maxBytes) throw new Error('too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function resendReceivingClient(apiKey: string): ReceivingClient {
  const auth = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  return {
    async get(emailId) {
      const response = await fetch(`${RECEIVING}/${encodeURIComponent(emailId)}`, { headers: auth })
      if (!response.ok) throw new Error('receiving_get_failed')
      return mapReceivingPayload(await response.json(), emailId)
    },
    async download(url, maxBytes) {
      const response = await fetch(url)
      return readBounded(response, maxBytes)
    },
    async attachmentDownloadUrl(emailId, attachmentId) {
      const response = await fetch(
        `${RECEIVING}/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { headers: auth }
      )
      if (!response.ok) throw new Error('attachment_lookup_failed')
      const json = (await response.json()) as { download_url?: string; data?: { download_url?: string } }
      const url = json.download_url || json.data?.download_url
      if (!url) throw new Error('attachment_lookup_failed')
      return url
    },
  }
}
