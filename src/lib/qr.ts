'use client'

import QRCode from 'qrcode'
// qrcode's public types only cover toDataURL/toCanvas; the matrix encoder has no declarations.
// @ts-expect-error
import QRCore from 'qrcode/lib/core/qrcode'

type QrSymbol = { modules: { size: number; get: (row: number, col: number) => number } }

function createQrSymbol(text: string, options: { errorCorrectionLevel: 'H' }): QrSymbol {
  const mod = QRCore as { create?: typeof createQrSymbol; default?: { create?: typeof createQrSymbol } }
  const create = mod.create || mod.default?.create
  if (!create) throw new Error('QR encoder unavailable')
  return create(text, options)
}

const CASH_ID_LIME = '#E5FF63'
const CASH_ID_DARK = '#111111'

function inFinder(row: number, col: number, n: number): boolean {
  return (row < 7 && col < 7) || (row < 7 && col >= n - 7) || (row >= n - 7 && col < 7)
}

function drawFinder(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cell: number
) {
  // Square finders (1:1:3:1:1) so stock phone cameras can lock on the code.
  const size = cell * 7
  ctx.fillStyle = CASH_ID_LIME
  ctx.fillRect(originX, originY, size, size)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(originX + cell, originY + cell, cell * 5, cell * 5)
  ctx.fillStyle = CASH_ID_LIME
  ctx.fillRect(originX + cell * 2, originY + cell * 2, cell * 3, cell * 3)
}

/**
 * Cash ID QR: high error correction, lime finder marks, dark round data dots.
 */
export async function generateStyledCashIdQr(text: string, size: number = 880): Promise<string> {
  const qr = createQrSymbol(text, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const quiet = 4
  const cell = size / (n + quiet * 2)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create QR canvas')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  const finders: Array<[number, number]> = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]
  for (const [row, col] of finders) {
    drawFinder(ctx, (col + quiet) * cell, (row + quiet) * cell, cell)
  }

  ctx.fillStyle = CASH_ID_DARK
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (inFinder(row, col, n) || !qr.modules.get(row, col)) continue
      const cx = (col + quiet + 0.5) * cell
      const cy = (row + quiet + 0.5) * cell
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return canvas.toDataURL('image/png')
}

/**
 * Generate QR code as data URL (PNG)
 */
export async function generateQRCodeDataURL(text: string, size: number = 220): Promise<string> {
  try {
    const dataURL = await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
    return dataURL
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw error
  }
}

/**
 * Generate QR code as canvas element
 */
export async function generateQRCodeCanvas(text: string, size: number = 220): Promise<HTMLCanvasElement> {
  try {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
    return canvas
  } catch (error) {
    console.error('Error generating QR code canvas:', error)
    throw error
  }
}

/**
 * Generate plain QR code (no logo overlay)
 */
export async function generateQRCode(text: string, size: number = 512): Promise<string> {
  try {
    const dataURL = await QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
    return dataURL
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw error
  }
}

/**
 * Download QR code as PNG
 */
export function downloadQRCode(dataURL: string, filename: string = 'qr-code.png'): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataURL
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

/**
 * Render the on-screen Cash ID (QR + center avatar) as a PNG data URL.
 */
export async function renderCashIdPngDataUrl(options: {
  qrDataURL: string
  avatarUrl?: string | null
}): Promise<string> {
  const size = 880
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create download canvas')

  const qrImg = await loadImage(options.qrDataURL)
  ctx.drawImage(qrImg, 0, 0, size, size)

  const avatarSize = Math.round(size * (40 / 220))
  const ring = Math.round(size * (6 / 220))
  const cx = size / 2
  const cy = size / 2

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, avatarSize / 2 + ring, 0, Math.PI * 2)
  ctx.fill()

  try {
    const avatarSrc = options.avatarUrl || '/assets/avatar-profile.png'
    const avatarImg = await loadImage(avatarSrc)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(avatarImg, cx - avatarSize / 2, cy - avatarSize / 2, avatarSize, avatarSize)
    ctx.restore()
  } catch {
    // Avatar may be cross-origin; QR alone is still a valid Cash ID.
  }

  return canvas.toDataURL('image/png')
}

/**
 * Save the on-screen Cash ID (QR + center avatar) as a PNG.
 */
export async function downloadCashIdPng(options: {
  qrDataURL: string
  avatarUrl?: string | null
  filename?: string
}): Promise<void> {
  const dataUrl = await renderCashIdPngDataUrl(options)
  downloadQRCode(dataUrl, options.filename || 'cash-id.png')
}

