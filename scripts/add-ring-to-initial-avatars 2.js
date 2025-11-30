// scripts/add-ring-to-initial-avatars.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_DIR = path.join(__dirname, '..', 'public', 'generated-avatars', 'initials')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'generated-avatars', 'initials-ring')

// Canvas size
const SIZE = 256
// Ring thickness: make it thicker - 32px for clearly visible ring (was 24px)
const RING_WIDTH = 32
const OUTER_RADIUS = SIZE / 2 // 128px
const INNER_RADIUS = OUTER_RADIUS - RING_WIDTH // 104px
// Avatar scale: scale down slightly so ring is clearly visible (using ~92% to match previous proportions)
const AVATAR_SCALE = 0.92
const AVATAR_SIZE = Math.floor(SIZE * AVATAR_SCALE) // ~235px

// Limited set of initials (13 letters)
const INITIALS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

async function addRingToInitialAvatar(letter) {
  const inputPath = path.join(INPUT_DIR, `avatar-${letter}.png`)
  const outputPath = path.join(OUTPUT_DIR, `avatar-${letter}.png`)

  console.log(`→ processing ${letter} → avatar-${letter}.png`)

  // Load the base initial avatar
  const avatarBuffer = await sharp(inputPath)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
    .toBuffer()

  // Create white ring using stroke approach (more reliable than mask)
  // Draw outer circle with thick stroke, then mask out inner circle
  const ringSvg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ringMask">
          <rect width="${SIZE}" height="${SIZE}" fill="black"/>
          <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${INNER_RADIUS}" fill="white"/>
        </mask>
      </defs>
      <!-- Outer white circle -->
      <circle
        cx="${SIZE / 2}"
        cy="${SIZE / 2}"
        r="${OUTER_RADIUS}"
        fill="white"
      />
      <!-- Mask out inner circle to create ring -->
      <circle
        cx="${SIZE / 2}"
        cy="${SIZE / 2}"
        r="${INNER_RADIUS}"
        fill="black"
        mask="url(#ringMask)"
      />
    </svg>
  `

  // Alternative: Use stroke-based ring (simpler and more reliable)
  const ringSvgStroke = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="${SIZE / 2}"
        cy="${SIZE / 2}"
        r="${OUTER_RADIUS - RING_WIDTH / 2}"
        fill="none"
        stroke="white"
        stroke-width="${RING_WIDTH}"
      />
    </svg>
  `

  // Composite: white ring + scaled avatar on transparent background
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
        input: Buffer.from(ringSvgStroke),
        blend: 'over'
      },
      {
        input: avatarBuffer,
        left: Math.floor((SIZE - AVATAR_SIZE) / 2), // Center the scaled avatar
        top: Math.floor((SIZE - AVATAR_SIZE) / 2),
        blend: 'over'
      }
    ])
    .png()
    .toFile(outputPath)

  console.log(`✓ done avatar-${letter}.png`)
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

  console.log(`Adding thick white ring to ${INITIALS.length} initial avatar assets\n`)

  for (const letter of INITIALS) {
    const inputPath = path.join(INPUT_DIR, `avatar-${letter}.png`)
    if (!fs.existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`)
      continue
    }

    try {
      await addRingToInitialAvatar(letter)
    } catch (err) {
      console.error(`Error processing ${letter}:`, err.message)
    }
  }

  console.log(`\n✅ All ringed initial avatars processed.`)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
