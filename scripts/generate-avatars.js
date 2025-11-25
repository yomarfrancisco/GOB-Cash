// scripts/generate-avatars.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_DIR = path.join(__dirname, '..', 'public', 'raw-avatars')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'generated-avatars')

// Use a decent base resolution so it looks crisp on mobile
const SIZE = 512
const RING_WIDTH = 48 // White ring width in pixels (thicker ring, ~3x previous 16px)

async function processAvatar(file) {
  const inputPath = path.join(INPUT_DIR, file)
  const outputName = file.replace(/\.[^.]+$/, '.png')
  const outputPath = path.join(OUTPUT_DIR, outputName)

  console.log('→ processing', file, '→', outputName)

  // Load and resize avatar to square
  const avatarBuffer = await sharp(inputPath)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
    .toBuffer()

  // Create circular mask for avatar (inner circle)
  const avatarRadius = SIZE / 2 - RING_WIDTH
  const avatarMask = Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${avatarRadius}" fill="black"/>
    </svg>
  `)

  // Apply circular mask to avatar
  const maskedAvatar = await sharp(avatarBuffer)
    .composite([
      {
        input: avatarMask,
        blend: 'dest-in'
      }
    ])
    .toBuffer()

  // Create white ring (outer circle with transparent center)
  const ringSvg = Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="${SIZE / 2}"
        cy="${SIZE / 2}"
        r="${SIZE / 2 - RING_WIDTH / 2}"
        fill="none"
        stroke="white"
        stroke-width="${RING_WIDTH}"
      />
    </svg>
  `)

  // Composite: white ring on top of masked avatar
  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    }
  })
    .composite([
      {
        input: maskedAvatar,
        blend: 'over'
      },
      {
        input: ringSvg,
        blend: 'over'
      }
    ])
    .png()
    .toFile(outputPath)

  console.log('✓ done', outputName)
}

async function run() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error('INPUT_DIR does not exist:', INPUT_DIR)
    process.exit(1)
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log('Created OUTPUT_DIR:', OUTPUT_DIR)
  }

  const files = fs.readdirSync(INPUT_DIR).filter(f => !f.startsWith('.') && /\.(png|jpg|jpeg)$/i.test(f))

  if (files.length === 0) {
    console.error('No image files found in', INPUT_DIR)
    process.exit(1)
  }

  console.log(`Found ${files.length} avatar(s) to process\n`)

  for (const file of files) {
    try {
      await processAvatar(file)
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message)
    }
  }

  console.log('\n✅ All avatars processed.')
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

