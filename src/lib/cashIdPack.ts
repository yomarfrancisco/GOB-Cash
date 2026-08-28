'use client'

import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { renderCashIdPngDataUrl } from '@/lib/qr'

const LIME = { r: 229, g: 255, b: 99 }
const PAGE_W = 210
const QR_MM = 72
const QR_PAD_MM = 4
const TITLE_SRC = '/assets/My-Cash-ID2.png'

export type CashIdPackProfile = {
  handle: string
  fullName?: string | null
  email?: string | null
  whatsapp?: string | null
  avatarUrl?: string | null
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || ''
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function loadImageDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not read title image'))
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load title image'))
    img.src = src
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function addCenteredQr(doc: jsPDF, qrPng: string, y: number): number {
  const outer = QR_MM + QR_PAD_MM * 2
  const x = (PAGE_W - outer) / 2
  doc.setFillColor(LIME.r, LIME.g, LIME.b)
  doc.roundedRect(x, y, outer, outer, 4, 4, 'F')
  doc.addImage(qrPng, 'PNG', x + QR_PAD_MM, y + QR_PAD_MM, QR_MM, QR_MM)
  return y + outer
}

function addCenteredText(
  doc: jsPDF,
  text: string,
  y: number,
  size: number,
  color: [number, number, number] = [10, 10, 10]
): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
  doc.text(text, PAGE_W / 2, y, { align: 'center' })
  return y
}

function buildPdf(options: {
  qrPng: string
  handle: string
  titlePng?: string
  fullName?: string
  email?: string
  whatsapp?: string
}): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 28

  if (options.titlePng) {
    const titleW = 92
    const titleH = titleW * (384 / 960)
    doc.addImage(options.titlePng, 'PNG', (PAGE_W - titleW) / 2, y, titleW, titleH)
    y += titleH + 10
  }

  y = addCenteredQr(doc, options.qrPng, y)
  y += 14
  addCenteredText(doc, options.handle, y, 18)
  y += 12

  if (options.fullName) {
    addCenteredText(doc, options.fullName, y, 13)
    y += 8
  }
  if (options.email) {
    addCenteredText(doc, options.email, y, 11, [102, 102, 102])
    y += 7
  }
  if (options.whatsapp) {
    addCenteredText(doc, options.whatsapp, y, 11, [102, 102, 102])
  }

  return doc.output('arraybuffer')
}

function slugHandle(handle: string): string {
  return handle.replace(/^@/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'cash-id'
}

/** Download a zip: QR PNG + three PDFs (QR+handle, page layout, contact layout). */
export async function downloadCashIdZip(options: {
  qrDataURL: string
  profile: CashIdPackProfile
}): Promise<void> {
  const handle = options.profile.handle.startsWith('@')
    ? options.profile.handle
    : `@${options.profile.handle}`
  const slug = slugHandle(handle)
  const fullName = options.profile.fullName?.trim() || undefined
  const email = options.profile.email?.trim() || undefined
  const whatsapp = options.profile.whatsapp?.trim() || undefined

  const [qrPng, titlePng] = await Promise.all([
    renderCashIdPngDataUrl({
      qrDataURL: options.qrDataURL,
      avatarUrl: options.profile.avatarUrl,
    }),
    loadImageDataUrl(TITLE_SRC).catch(() => ''),
  ])

  const qrHandlePdf = buildPdf({ qrPng, handle })
  const pagePdf = buildPdf({
    qrPng,
    handle,
    titlePng: titlePng || undefined,
  })
  const contactPdf = buildPdf({
    qrPng,
    handle,
    titlePng: titlePng || undefined,
    fullName,
    email,
    whatsapp,
  })

  const zip = new JSZip()
  zip.file(`${slug}-qr.png`, dataUrlToUint8(qrPng))
  zip.file(`${slug}-qr.pdf`, qrHandlePdf)
  zip.file(`${slug}-cash-id.pdf`, pagePdf)
  zip.file(`${slug}-cash-id-contact.pdf`, contactPdf)

  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, `${slug}-cash-id.zip`)
}
