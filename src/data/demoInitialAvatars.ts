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

// SADC region polygon (approximate bounding polygon)
// Format: [lng, lat] pairs - covering SADC countries
const SADC_POLYGON: [number, number][] = [
  [12, -17],   // Northern Angola/Zambia border
  [12, -28],   // Western border (Angola/Namibia)
  [16, -35],   // South-western corner (Namibia/SA)
  [30, -35],   // South-eastern corner (SA)
  [40, -22],   // Eastern border (Mozambique)
  [40, -12],   // North-eastern corner (Tanzania)
  [32, -12],   // Northern border (Tanzania)
  [12, -17],   // Back to start
]

// Bounding box for quick rejection (faster than polygon test)
const SADC_BBOX = {
  minLng: 12,
  maxLng: 40,
  minLat: -35,
  maxLat: -12,
}

// Point-in-polygon test using ray casting algorithm
function isPointInPolygon(lng: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Generate a random point within SADC polygon
function generateRandomSADCPoint(): { lat: number; lng: number } {
  let attempts = 0
  const maxAttempts = 50 // Increased retries

  while (attempts < maxAttempts) {
    // Generate random point within bounding box
    const lng = SADC_BBOX.minLng + Math.random() * (SADC_BBOX.maxLng - SADC_BBOX.minLng)
    const lat = SADC_BBOX.minLat + Math.random() * (SADC_BBOX.maxLat - SADC_BBOX.minLat)

    // Check if point is inside polygon
    if (isPointInPolygon(lng, lat, SADC_POLYGON)) {
      return { lat, lng }
    }

    attempts++
  }

  // Fallback: return a known good SADC point (Johannesburg area)
  return { lat: -26.2, lng: 28.0 }
}

// Initial letters (A, C, E, G, I, K, M, O, Q, S, U, W, Y)
const INITIAL_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

// Generate 50 entries with random positions across SADC polygon
const INITIAL_AVATAR_COUNT = 50

export const DEMO_INITIAL_AVATARS: DemoInitialAvatar[] = Array.from({ length: INITIAL_AVATAR_COUNT }).map((_, i) => {
  const letter = INITIAL_LETTERS[i % INITIAL_LETTERS.length]
  const { lat, lng } = generateRandomSADCPoint()

  return {
    id: `initial-${letter}-${i}`,
    name: letter,
    avatarSrc: `/generated-avatars/initials-ring/avatar-${letter}.png`,
    lng,
    lat,
  }
})
