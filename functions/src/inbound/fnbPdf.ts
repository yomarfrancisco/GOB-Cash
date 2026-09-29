export async function pdfText(bytes: Buffer, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const open = (pw?: string) =>
    pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      ...(pw ? { password: pw } : {}),
    } as Parameters<typeof pdfjs.getDocument>[0]).promise
  let doc
  try {
    doc = await open()
  } catch (error) {
    const locked = /password/i.test(error instanceof Error ? error.message : '')
    if (!password || !locked) throw error
    doc = await open(password)
  }
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n'))
  }
  return parts.join('\n')
}
