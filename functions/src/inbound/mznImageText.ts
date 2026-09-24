/** Cloud Vision read of a screenshot. Empty string if the API is unavailable. */

export async function imageText(bytes: Buffer): Promise<string> {
  const tokenRes = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  )
  if (!tokenRes.ok) return ''
  const tokenBody = (await tokenRes.json()) as { access_token?: string }
  if (!tokenBody.access_token) return ''
  const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: bytes.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  })
  if (!res.ok) return ''
  const data = (await res.json()) as {
    responses?: Array<{ fullTextAnnotation?: { text?: string } }>
  }
  return data.responses?.[0]?.fullTextAnnotation?.text || ''
}
