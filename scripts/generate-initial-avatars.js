// scripts/generate-initial-avatars.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_AVATAR = path.join(__dirname, '..', 'public', 'assets', 'avatar-profile.png')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'generated-avatars', 'initials')

// Use 256x256 for initial avatars (smaller than full ring avatars but still crisp)
const SIZE = 256
const RING_WIDTH = 24 // Proportional to 48px ring on 512px (scaled down)

// Limited set of initials (13 letters)
const INITIALS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

async function generateInitialAvatar(letter) {
  const outputPath = path.join(OUTPUT_DIR, `avatar-${letter}.png`)

  console.log(`→ processing ${letter} → avatar-${letter}.png`)

  // Load base avatar image and resize
  const avatarBuffer = await sharp(INPUT_AVATAR)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
    .toBuffer()

  // Create circular mask for avatar (inner circle, accounting for ring)
  const avatarRadius = SIZE / 2 - RING_WIDTH
  const avatarMaskSvg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="circle">
          <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${avatarRadius}"/>
        </clipPath>
      </defs>
      <rect width="${SIZE}" height="${SIZE}" fill="white" clip-path="url(#circle)"/>
    </svg>
  `

  // Apply circular mask to avatar
  const maskedAvatar = await sharp(avatarBuffer)
    .composite([
      {
        input: Buffer.from(avatarMaskSvg),
        blend: 'dest-in'
      }
    ])
    .toBuffer()

  // Create white ring as a donut shape
  const ringSvg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ringMask">
          <rect width="${SIZE}" height="${SIZE}" fill="black"/>
          <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${avatarRadius}" fill="white"/>
        </mask>
      </defs>
      <circle
        cx="${SIZE / 2}"
        cy="${SIZE / 2}"
        r="${SIZE / 2 - RING_WIDTH / 2}"
        fill="white"
        mask="url(#ringMask)"
      />
    </svg>
  `

  // Create initial letter text - PURE WHITE with subtle dark shadow for contrast
  const fontSize = SIZE * 0.5 // 50% of canvas size for large, legible letter
  const letterSvg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <text
        x="${SIZE / 2}"
        y="${SIZE / 2 + fontSize * 0.35}"
        font-family="-apple-system, system-ui, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#FFFFFF"
        text-anchor="middle"
        dominant-baseline="middle"
        filter="url(#shadow)"
      >${letter}</text>
    </svg>
  `

  // Composite: masked avatar + white ring + initial letter on transparent background
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
        input: Buffer.from(ringSvg),
        blend: 'over'
      },
      {
        input: Buffer.from(letterSvg),
        blend: 'over'
      }
    ])
    .png()
    .toFile(outputPath)

  console.log(`✓ done avatar-${letter}.png`)
}

async function run() {
  if (!fs.existsSync(INPUT_AVATAR)) {
    console.error('INPUT_AVATAR does not exist:', INPUT_AVATAR)
    process.exit(1)
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log('Created OUTPUT_DIR:', OUTPUT_DIR)
  }

  console.log(`Generating ${INITIALS.length} initial avatar assets\n`)

  for (const letter of INITIALS) {
    try {
      await generateInitialAvatar(letter)
    } catch (err) {
      console.error(`Error processing ${letter}:`, err.message)
    }
  }

  console.log(`\n✅ All initial avatars processed.`)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
