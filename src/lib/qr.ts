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

const CASH_ID_PINK = '#FF2D55'
const CASH_ID_DARK = '#111111'

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function inFinder(row: number, col: number, n: number): boolean {
  return (row < 7 && col < 7) || (row < 7 && col >= n - 7) || (row >= n - 7 && col < 7)
}

function drawFinder(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cell: number
) {
  const size = cell * 7
  ctx.fillStyle = CASH_ID_PINK
  roundedRect(ctx, originX, originY, size, size, cell * 1.2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, originX + cell, originY + cell, cell * 5, cell * 5, cell * 0.85)
  ctx.fill()

  ctx.fillStyle = CASH_ID_PINK
  roundedRect(ctx, originX + cell * 2, originY + cell * 2, cell * 3, cell * 3, cell * 0.7)
  ctx.fill()
}

/**
 * Cash ID QR: high error correction, pink finder marks, dark round data dots.
 */
export async function generateStyledCashIdQr(text: string, size: number = 880): Promise<string> {
  const qr = createQrSymbol(text, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const quiet = 2
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

