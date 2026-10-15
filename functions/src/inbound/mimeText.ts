/** Minimal text/plain (and HTML-stripped) extraction from a raw RFC822 buffer. */

export function extractMimeText(raw: Buffer | string): string {
  const source = typeof raw === 'string' ? raw : raw.toString('utf8')
  const plain = partBody(source, /content-type:\s*text\/plain\b/i)
  if (plain) return decodeBody(plain)
  const html = partBody(source, /content-type:\s*text\/html\b/i)
  if (html) return stripHtml(decodeBody(html))
  // Single-part body after headers
  const split = source.match(/\r?\n\r?\n([\s\S]*)$/)
  return split ? decodeBody(split[1]!) : source
}

function partBody(source: string, typeRe: RegExp): string | null {
  const boundaryMatch = source.match(/boundary="?([^";\r\n]+)"?/i)
  if (!boundaryMatch) {
    if (!typeRe.test(source.slice(0, 2000))) return null
    const split = source.match(/\r?\n\r?\n([\s\S]*)$/)
    return split ? split[1]! : null
  }
  const boundary = boundaryMatch[1]!
  const parts = source.split(new RegExp(`--${escapeRegExp(boundary)}`))
  for (const part of parts) {
    if (!typeRe.test(part.slice(0, 800))) continue
    const split = part.match(/\r?\n\r?\n([\s\S]*?)(?:\r?\n--|$)/)
    if (split) return split[1]!
  }
  return null
}

function decodeBody(body: string): string {
  let out = body
  if (/=\r?\n/.test(out) || /=[0-9A-Fa-f]{2}/.test(out)) {
    out = out
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  }
  return out.replace(/\r\n/g, '\n').trim()
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
