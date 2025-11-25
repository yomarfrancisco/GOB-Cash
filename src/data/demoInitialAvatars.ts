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
// Format: [lng, lat] pairs
const SADC_POLYGON: [number, number][] = [
  [-17, 12],   // Angola
  [-28, 12],
  [-35, 16],
  [-35, 30],   // SA
  [-22, 40],
  [-12, 40],
  [-12, 32],   // Tanzania
  [-17, 12],
]

// Bounding box for quick rejection (faster than polygon test)
const SADC_BBOX = {
  minLng: -35,
  maxLng: 40,
  minLat: -35,
  maxLat: 12,
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
  const maxAttempts = 20

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

  // Fallback: return center of SADC region if all attempts fail
  return { lat: -20, lng: 25 }
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
