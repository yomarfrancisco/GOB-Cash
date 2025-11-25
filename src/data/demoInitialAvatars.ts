/**
 * Demo Initial Avatars for Map
 * 50 initial avatars with white rings, scattered across SADC region
 */

export type DemoInitialAvatar = {
  id: string
  name: string
  avatarSrc: string
  lng: number
  lat: number
}

// SADC bounding box
const SADC_LNG_MIN = 10
const SADC_LNG_MAX = 40
const SADC_LAT_MIN = -35
const SADC_LAT_MAX = -10

// Initial letters (A, C, E, G, I, K, M, O, Q, S, U, W, Y)
const INITIAL_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

// Generate 50 entries with deterministic positions across SADC
// Using seeded pseudo-random for consistent but scattered positions
export const DEMO_INITIAL_AVATARS: DemoInitialAvatar[] = Array.from({ length: 50 }).map((_, i) => {
  const letter = INITIAL_LETTERS[i % INITIAL_LETTERS.length]
  
  // Use seeded pseudo-random for consistent but scattered positions
  const seed1 = i * 7919
  const seed2 = i * 9973
  
  // Generate base grid position (7x7 grid = 49 points, plus one extra)
  const gridSize = 7
  const col = i % gridSize
  const row = Math.floor(i / gridSize)
  
  // Base position from grid
  const baseLng = SADC_LNG_MIN + (SADC_LNG_MAX - SADC_LNG_MIN) * (col / (gridSize - 1))
  const baseLat = SADC_LAT_MIN + (SADC_LAT_MAX - SADC_LAT_MIN) * (row / (gridSize - 1))
  
  // Add jitter (up to ±2 degrees) for natural dispersion
  const jitterLng = ((seed1 % 200) / 100 - 1) * 2 // -2 to +2
  const jitterLat = ((seed2 % 200) / 100 - 1) * 2 // -2 to +2
  
  const lng = Math.max(SADC_LNG_MIN, Math.min(SADC_LNG_MAX, baseLng + jitterLng))
  const lat = Math.max(SADC_LAT_MIN, Math.min(SADC_LAT_MAX, baseLat + jitterLat))
  
  return {
    id: `initial-${letter}-${i}`,
    name: letter,
    avatarSrc: `/generated-avatars/initials-ring/avatar-${letter}.png`,
    lng,
    lat,
  }
})

