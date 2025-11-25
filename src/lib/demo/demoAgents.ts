/**
 * Demo Agents for Map
 * Defines demo agents that appear as markers on the map in demo mode
 */

export type DemoAgent = {
  id: string
  name: string
  handle: string
  avatar: string
  lat: number
  lng: number
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: 'demo-naledi',
    name: 'Naledi',
    handle: '@naledi',
    avatar: '/generated-avatars/avatar_naledi.png',
    lat: -26.2041,
    lng: 28.0473, // Johannesburg
  },
  {
    id: 'demo-joao',
    name: 'João',
    handle: '@joao',
    avatar: '/generated-avatars/avatar_joao.png',
    lat: -25.9692,
    lng: 32.5732, // Maputo
  },
  {
    id: 'demo-thabo',
    name: 'Thabo',
    handle: '@thabo',
    avatar: '/generated-avatars/avatar_thabo.png',
    lat: -33.9249,
    lng: 18.4241, // Cape Town
  },
  {
    id: 'demo-sarah',
    name: 'Sarah',
    handle: '@sarah',
    avatar: '/generated-avatars/avatar_sarah.png',
    lat: -29.8587,
    lng: 31.0218, // Durban
  },
]

// 50 demo initial avatars with proper dispersion across SADC region
// Letters cycle through: A, C, E, G, I, K, M, O, Q, S, U, W, Y
const INITIAL_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

// SADC bounding box: lng ∈ [15, 40], lat ∈ [-35, -10]
const SADC_LNG_MIN = 15
const SADC_LNG_MAX = 40
const SADC_LAT_MIN = -35
const SADC_LAT_MAX = -10

// Generate 50 entries with natural dispersion using seeded jitter
export const DEMO_INITIAL_AVATARS: DemoAgent[] = Array.from({ length: 50 }).map((_, i) => {
  const letter = INITIAL_LETTERS[i % INITIAL_LETTERS.length]
  
  // Use seeded pseudo-random for consistent but scattered positions
  // Multiply by primes to avoid clustering
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
    id: `init-${letter}-${i}`,
    name: letter,
    handle: `@agent${letter.toLowerCase()}`,
    avatar: `/generated-avatars/initials-ring/avatar-${letter}.png`,
    lat,
    lng,
  }
})

