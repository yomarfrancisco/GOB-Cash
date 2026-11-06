function loadPdfJs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  // tsc rewrites `import()` to `require()` under commonjs; pdfjs is ESM-only.
  // Evaluate a real dynamic import at runtime so Cloud Functions can load it.
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>
  return dynamicImport('pdfjs-dist/legacy/build/pdf.mjs')
}

function isPasswordError(error: unknown): boolean {
  return /password/i.test(error instanceof Error ? error.message : String(error || ''))
}

export async function pdfText(
  bytes: Buffer,
  password?: string | readonly string[] | null
): Promise<string> {
  const pdfjs = await loadPdfJs()
  const passwords = Array.isArray(password)
    ? password.filter(Boolean)
    : password
      ? [password]
      : []

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
    if (!isPasswordError(error) || passwords.length === 0) throw error
    let lastError: unknown = error
    for (const pw of passwords) {
      try {
        doc = await open(pw)
        lastError = null
        break
      } catch (attempt) {
        lastError = attempt
        if (!isPasswordError(attempt)) throw attempt
      }
    }
    if (!doc) throw lastError instanceof Error ? lastError : error
  }

  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n'))
  }
  return parts.join('\n')
}
