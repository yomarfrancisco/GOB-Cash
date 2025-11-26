/**
 * Demo Initial Avatars for Map
 * 50 initial avatars with white rings, scattered across SADC region
 * Positioned at key cities with realistic dispersion
 */

export type DemoInitialAvatar = {
  id: string
  name: string
  avatarSrc: string
  lng: number
  lat: number
}

// Key SADC cities that must have avatar coverage
const KEY_CITIES = [
  // Angola
  { id: 'luanda', name: 'Luanda', lat: -8.8383, lng: 13.2344 },
  { id: 'lobito', name: 'Lobito', lat: -12.3481, lng: 13.5456 },
  
  // Mozambique
  { id: 'beira', name: 'Beira', lat: -19.8333, lng: 34.8333 },
  { id: 'quelimane', name: 'Quelimane', lat: -17.8764, lng: 36.8872 },
  { id: 'nacala', name: 'Nacala', lat: -14.5428, lng: 40.6728 },
  { id: 'chimoio', name: 'Chimoio', lat: -19.1167, lng: 33.4833 },
  
  // Zambia
  { id: 'lusaka', name: 'Lusaka', lat: -15.3875, lng: 28.3228 },
  { id: 'livingstone', name: 'Livingstone', lat: -17.8419, lng: 25.8544 },
  
  // Namibia
  { id: 'windhoek', name: 'Windhoek', lat: -22.5597, lng: 17.0836 },
  
  // South Africa
  { id: 'nelspruit', name: 'Nelspruit', lat: -25.4744, lng: 30.9703 },
  
  // Zimbabwe
  { id: 'harare', name: 'Harare', lat: -17.8292, lng: 31.0522 },
  
  // Other SADC capitals/key cities
  { id: 'gaborone', name: 'Gaborone', lat: -24.6581, lng: 25.9086 }, // Botswana
  { id: 'lilongwe', name: 'Lilongwe', lat: -13.9626, lng: 33.7741 }, // Malawi
  { id: 'mbabane', name: 'Mbabane', lat: -26.3167, lng: 31.1333 }, // Eswatini
  { id: 'maseru', name: 'Maseru', lat: -29.3100, lng: 27.4800 }, // Lesotho
  { id: 'kinshasa', name: 'Kinshasa', lat: -4.3276, lng: 15.3136 }, // DRC
  { id: 'brazzaville', name: 'Brazzaville', lat: -4.2634, lng: 15.2429 }, // Republic of Congo
  { id: 'dar-es-salaam', name: 'Dar es Salaam', lat: -6.7924, lng: 39.2083 }, // Tanzania
]

// Initial letters (A, C, E, G, I, K, M, O, Q, S, U, W, Y)
const INITIAL_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

// Generate random offset near a city (biased inland for coastal cities)
function generateNearbyOffset(city: { lat: number; lng: number }, isCoastal: boolean): { lat: number; lng: number } {
  // Base offset range: ±0.3 degrees (~33km)
  const baseOffset = 0.3
  
  // For coastal cities, bias inland (reduce offset toward ocean)
  let latOffset = (Math.random() - 0.5) * baseOffset * 2
  let lngOffset = (Math.random() - 0.5) * baseOffset * 2
  
  if (isCoastal) {
    // Bias away from ocean (toward higher latitudes for southern Africa)
    if (latOffset < 0) latOffset *= 0.5 // Reduce southward offset
    // Keep lng offset as-is (east-west is generally safe)
  }
  
  return {
    lat: city.lat + latOffset,
    lng: city.lng + lngOffset,
  }
}

// Identify coastal cities (need inland bias)
const COASTAL_CITIES = new Set(['luanda', 'lobito', 'beira', 'quelimane', 'nacala', 'dar-es-salaam'])

// Generate 50 initial avatars
const INITIAL_AVATAR_COUNT = 50
const AVATARS_PER_CITY = 2 // Average avatars per city (will vary)

export const DEMO_INITIAL_AVATARS: DemoInitialAvatar[] = []

let letterIndex = 0

// First pass: Place 1-2 avatars at each key city
KEY_CITIES.forEach((city, cityIndex) => {
  const isCoastal = COASTAL_CITIES.has(city.id)
  const avatarsAtCity = cityIndex < KEY_CITIES.length - 5 ? 2 : 1 // More avatars at first cities
  
  for (let i = 0; i < avatarsAtCity; i++) {
    if (DEMO_INITIAL_AVATARS.length >= INITIAL_AVATAR_COUNT) break
    
    const letter = INITIAL_LETTERS[letterIndex % INITIAL_LETTERS.length]
    letterIndex++
    
    // First avatar at exact city, subsequent with small offset
    const offset = i === 0 ? { lat: 0, lng: 0 } : generateNearbyOffset(city, isCoastal)
    
    DEMO_INITIAL_AVATARS.push({
      id: `initial-${letter}-${city.id}-${i}`,
      name: letter,
      avatarSrc: `/generated-avatars/initials-ring/avatar-${letter}.png`,
      lat: city.lat + offset.lat,
      lng: city.lng + offset.lng,
    })
  }
})

// Second pass: Fill remaining slots with nearby random positions
while (DEMO_INITIAL_AVATARS.length < INITIAL_AVATAR_COUNT) {
  // Pick a random city
  const randomCity = KEY_CITIES[Math.floor(Math.random() * KEY_CITIES.length)]
  const isCoastal = COASTAL_CITIES.has(randomCity.id)
  
  const letter = INITIAL_LETTERS[letterIndex % INITIAL_LETTERS.length]
  letterIndex++
  
  const offset = generateNearbyOffset(randomCity, isCoastal)
  
  DEMO_INITIAL_AVATARS.push({
    id: `initial-${letter}-${randomCity.id}-nearby-${DEMO_INITIAL_AVATARS.length}`,
    name: letter,
    avatarSrc: `/generated-avatars/initials-ring/avatar-${letter}.png`,
    lat: randomCity.lat + offset.lat,
    lng: randomCity.lng + offset.lng,
  })
}

// Sanity check: Ensure no avatars are obviously in the ocean
// Clamp any coordinates that are clearly offshore
DEMO_INITIAL_AVATARS.forEach((avatar) => {
  // Clamp to reasonable SADC bounds
  avatar.lat = Math.max(-35, Math.min(0, avatar.lat)) // South to equator
  avatar.lng = Math.max(10, Math.min(40, avatar.lng)) // East Africa bounds
})
