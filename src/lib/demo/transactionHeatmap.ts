/**
 * Transaction Heatmap Data Generation
 * Creates animated, self-morphing heatmap points for SADC region
 * Weighted toward major cities with continuous lifecycle management
 */

export interface CityDef {
  name: string
  center: [number, number] // [lng, lat]
  radius: number // degrees
  weight: number // probability weight (0-1)
}

export interface TransactionPoint {
  id: string
  coordinates: [number, number] // [lng, lat] - MUTABLE for morphing
  weight: number // 0.3 to 1.0
  timestamp: number
  city: string
  state: 'base' | 'active' | 'fading' | 'pulsing'
  pulseStartTime?: number
  fadeStartTime?: number
  baseWeight: number // Original weight before animations
  // Movement properties for morphing effect
  velocity?: [number, number] // [lngVelocity, latVelocity] in degrees per second
  driftDirection?: number // Angle in radians (0-2π)
  driftSpeed?: number // Degrees per second
  movementStartTime?: number // When current movement direction started
}

// SADC Cities with weighted distribution
// Major cities: 60% weight, Secondary: 30%, Rural: 10%
export const SADC_CITIES: Record<string, CityDef> = {
  // Major cities (60% weight)
  johannesburg: {
    name: 'Johannesburg',
    center: [28.0473, -26.2041],
    radius: 0.35,
    weight: 0.15,
  },
  capeTown: {
    name: 'Cape Town',
    center: [18.4241, -33.9249],
    radius: 0.4,
    weight: 0.12,
  },
  durban: {
    name: 'Durban',
    center: [31.0292, -29.8587],
    radius: 0.3,
    weight: 0.10,
  },
  maputo: {
    name: 'Maputo',
    center: [32.5732, -25.9692],
    radius: 0.25,
    weight: 0.10,
  },
  harare: {
    name: 'Harare',
    center: [31.0522, -17.8292],
    radius: 0.25,
    weight: 0.08,
  },
  // Secondary cities (30% weight)
  pretoria: {
    name: 'Pretoria',
    center: [28.1873, -25.7479],
    radius: 0.2,
    weight: 0.05,
  },
  portElizabeth: {
    name: 'Port Elizabeth',
    center: [25.5695, -33.9608],
    radius: 0.2,
    weight: 0.04,
  },
  beira: {
    name: 'Beira',
    center: [34.8431, -19.8333],
    radius: 0.15,
    weight: 0.04,
  },
  bulawayo: {
    name: 'Bulawayo',
    center: [28.5858, -20.1569],
    radius: 0.2,
    weight: 0.04,
  },
  gaborone: {
    name: 'Gaborone',
    center: [25.9086, -24.6282],
    radius: 0.2,
    weight: 0.04,
  },
  windhoek: {
    name: 'Windhoek',
    center: [17.0832, -22.5609],
    radius: 0.2,
    weight: 0.04,
  },
  lusaka: {
    name: 'Lusaka',
    center: [28.3228, -15.3875],
    radius: 0.25,
    weight: 0.05,
  },
  nampula: {
    name: 'Nampula',
    center: [39.2647, -15.1264],
    radius: 0.15,
    weight: 0.04,
  },
}

// Rural/suburban areas between cities (10% weight)
const RURAL_AREAS: Array<{ center: [number, number]; radius: number }> = [
  { center: [29.0, -26.5], radius: 0.5 }, // Between JHB and Pretoria
  { center: [30.0, -28.0], radius: 0.4 }, // Between JHB and Durban
  { center: [20.0, -30.0], radius: 0.4 }, // Between Cape Town and PE
  { center: [33.0, -24.0], radius: 0.3 }, // Between Maputo and JHB corridor
  { center: [29.0, -19.0], radius: 0.3 }, // Between Harare and Bulawayo
]

/**
 * Generate a random point within a city's radius
 */
export function generateRandomPointInCity(city: CityDef): TransactionPoint {
  const angle = Math.random() * Math.PI * 2
  const distance = Math.random() * city.radius
  const lng = city.center[0] + distance * Math.cos(angle)
  const lat = city.center[1] + distance * Math.sin(angle)

  return {
    id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    coordinates: [lng, lat],
    weight: 0.5 + Math.random() * 0.3, // 0.5 to 0.8 for base points
    timestamp: Date.now(),
    city: city.name,
    state: 'base',
    baseWeight: 0.5 + Math.random() * 0.3,
  }
}

/**
 * Generate a random point in a rural area
 */
function generateRandomPointInRural(): TransactionPoint {
  const area = RURAL_AREAS[Math.floor(Math.random() * RURAL_AREAS.length)]
  const angle = Math.random() * Math.PI * 2
  const distance = Math.random() * area.radius
  const lng = area.center[0] + distance * Math.cos(angle)
  const lat = area.center[1] + distance * Math.sin(angle)

  return {
    id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    coordinates: [lng, lat],
    weight: 0.3 + Math.random() * 0.2, // 0.3 to 0.5 for rural (lighter)
    timestamp: Date.now(),
    city: 'rural',
    state: 'base',
    baseWeight: 0.3 + Math.random() * 0.2,
  }
}

/**
 * Select a city based on weighted probability
 */
export function generateWeightedRandomCity(): CityDef | null {
  const rand = Math.random()
  let cumulative = 0

  for (const city of Object.values(SADC_CITIES)) {
    cumulative += city.weight
    if (rand <= cumulative) {
      return city
    }
  }

  // Fallback to first city if weights don't sum to 1
  return Object.values(SADC_CITIES)[0]
}

/**
 * Generate initial base points (150-200 points)
 */
export function generateInitialBasePoints(count: number = 175): TransactionPoint[] {
  const points: TransactionPoint[] = []

  // 60% in major cities
  const majorCityCount = Math.floor(count * 0.6)
  // 30% in secondary cities
  const secondaryCityCount = Math.floor(count * 0.3)
  // 10% in rural areas
  const ruralCount = count - majorCityCount - secondaryCityCount

  // Major cities
  const majorCities = ['johannesburg', 'capeTown', 'durban', 'maputo', 'harare']
  for (let i = 0; i < majorCityCount; i++) {
    const cityName = majorCities[Math.floor(Math.random() * majorCities.length)]
    const city = SADC_CITIES[cityName]
    if (city) {
      points.push(generateRandomPointInCity(city))
    }
  }

  // Secondary cities
  const secondaryCities = Object.keys(SADC_CITIES).filter(
    (key) => !majorCities.includes(key)
  )
  for (let i = 0; i < secondaryCityCount; i++) {
    const cityName = secondaryCities[Math.floor(Math.random() * secondaryCities.length)]
    const city = SADC_CITIES[cityName]
    if (city) {
      points.push(generateRandomPointInCity(city))
    }
  }

  // Rural areas
  for (let i = 0; i < ruralCount; i++) {
    points.push(generateRandomPointInRural())
  }

  return points
}

/**
 * Spawn new active points (intensifying over time)
 */
export function spawnNewActivePoints(count: number = 2): TransactionPoint[] {
  const newPoints: TransactionPoint[] = []

  for (let i = 0; i < count; i++) {
    // 90% chance city, 10% chance rural
    if (Math.random() < 0.9) {
      const city = generateWeightedRandomCity()
      if (city) {
        const point = generateRandomPointInCity(city)
        point.state = 'active'
        point.weight = 0.3 + Math.random() * 0.2 // Start lighter (0.3-0.5)
        point.baseWeight = point.weight
        newPoints.push(point)
      }
    } else {
      const point = generateRandomPointInRural()
      point.state = 'active'
      point.weight = 0.2 + Math.random() * 0.15 // Start lighter for rural
      point.baseWeight = point.weight
      newPoints.push(point)
    }
  }

  return newPoints
}

/**
 * Update point positions with random drift (creates morphing effect)
 * Points slowly drift in random directions, changing direction every 30-60 seconds
 */
export function updatePointPositions(points: TransactionPoint[]): TransactionPoint[] {
  const now = Date.now()
  
  return points.map((point) => {
    // Skip movement for fading points (they're disappearing anyway)
    if (point.state === 'fading') {
      return point
    }
    
    // Initialize movement if not set
    if (!point.velocity || !point.movementStartTime) {
      // Random drift direction
      const angle = Math.random() * Math.PI * 2
      const speed = 0.00015 + Math.random() * 0.00015 // 0.00015-0.0003 deg/sec (subtle but noticeable)
      point.velocity = [
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      ]
      point.movementStartTime = now
      point.driftDirection = angle
      point.driftSpeed = speed
    }
    
    // Change direction occasionally (every 30-60 seconds) for organic flow
    const movementAge = now - (point.movementStartTime || point.timestamp)
    if (movementAge > 30000 + Math.random() * 30000) {
      // New random direction
      const newAngle = Math.random() * Math.PI * 2
      const speed = point.driftSpeed || (0.00015 + Math.random() * 0.00015)
      point.velocity = [
        Math.cos(newAngle) * speed,
        Math.sin(newAngle) * speed
      ]
      point.driftDirection = newAngle
      point.movementStartTime = now
    }
    
    // Update position based on velocity (assuming ~1 second update interval)
    const [lng, lat] = point.coordinates
    const [lngVel, latVel] = point.velocity
    
    // Use fixed 1 second delta since we're called every 1 second
    // This creates smooth, continuous movement
    const deltaTime = 1.0
    
    point.coordinates = [
      lng + lngVel * deltaTime,
      lat + latVel * deltaTime
    ]
    
    return point
  })
}

/**
 * Update point weights based on their lifecycle state
 */
export function updatePointWeights(points: TransactionPoint[]): TransactionPoint[] {
  const now = Date.now()

  return points.map((point) => {
    const age = now - point.timestamp

    switch (point.state) {
      case 'active': {
        // Intensify over 2-4 minutes
        const intensifyDuration = 120000 + Math.random() * 120000 // 2-4 min
        const progress = Math.min(1, age / intensifyDuration)
        // Weight increases from baseWeight to 0.8-1.0
        const targetWeight = point.baseWeight + (0.8 - point.baseWeight) * progress
        point.weight = Math.min(1.0, targetWeight)

        // Transition to fading after 2-4 minutes
        if (age > intensifyDuration) {
          point.state = 'fading'
          point.fadeStartTime = now
        }
        break
      }

      case 'pulsing': {
        // Sinusoidal pulse (20-30 seconds)
        if (!point.pulseStartTime) {
          point.pulseStartTime = now
        }
        const pulseAge = now - point.pulseStartTime
        const pulseDuration = 20000 + Math.random() * 10000 // 20-30 sec
        const pulsePhase = (pulseAge % pulseDuration) / pulseDuration
        const pulseIntensity = Math.sin(pulsePhase * Math.PI * 2) * 0.3
        point.weight = Math.min(1.0, point.baseWeight + pulseIntensity)

        // Return to base state after pulse
        if (pulseAge > pulseDuration) {
          point.state = 'base'
          point.weight = point.baseWeight
          point.pulseStartTime = undefined
        }
        break
      }

      case 'fading': {
        // Fade out over 30 seconds
        if (!point.fadeStartTime) {
          point.fadeStartTime = now
        }
        const fadeAge = now - (point.fadeStartTime || point.timestamp)
        const fadeDuration = 30000 // 30 seconds
        const fadeProgress = Math.min(1, fadeAge / fadeDuration)
        point.weight = point.baseWeight * (1 - fadeProgress)
        break
      }

      case 'base': {
        // Base points maintain their weight (8-12 minute lifespan)
        point.weight = point.baseWeight
        break
      }
    }

    return point
  })
}

/**
 * Trigger random pulses on 5-10 existing points
 */
export function triggerRandomPulses(points: TransactionPoint[]): TransactionPoint[] {
  const pulseCount = 5 + Math.floor(Math.random() * 6) // 5-10 pulses
  const eligiblePoints = points.filter(
    (p) => p.state === 'base' && p.weight > 0.1
  )

  if (eligiblePoints.length === 0) return points

  const pointsToPulse = new Set<string>()
  for (let i = 0; i < Math.min(pulseCount, eligiblePoints.length); i++) {
    const randomPoint = eligiblePoints[Math.floor(Math.random() * eligiblePoints.length)]
    if (!pointsToPulse.has(randomPoint.id)) {
      pointsToPulse.add(randomPoint.id)
    }
  }

  return points.map((point) => {
    if (pointsToPulse.has(point.id) && point.state === 'base') {
      point.state = 'pulsing'
      point.pulseStartTime = Date.now()
    }
    return point
  })
}

/**
 * Remove expired points
 */
export function removeExpiredPoints(points: TransactionPoint[]): TransactionPoint[] {
  const now = Date.now()
  const BASE_LIFESPAN = 600000 // 10 minutes for base points
  const FADE_DURATION = 30000 // 30 seconds for fading

  return points.filter((point) => {
    const age = now - point.timestamp

    // Remove base points after 8-12 minutes
    if (point.state === 'base') {
      const lifespan = BASE_LIFESPAN + Math.random() * 240000 // 8-12 min
      return age < lifespan
    }

    // Remove fading points after fade duration
    if (point.state === 'fading') {
      if (!point.fadeStartTime) return true // Remove if no fade start time
      const fadeAge = now - point.fadeStartTime
      return fadeAge < FADE_DURATION
    }

    // Keep active and pulsing points
    return true
  })
}

/**
 * Convert points to GeoJSON FeatureCollection
 */
export function pointsToGeoJSON(
  points: TransactionPoint[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: point.coordinates,
      },
      properties: {
        weight: point.weight,
        timestamp: point.timestamp,
        city: point.city,
        state: point.state,
      },
    })),
  }
}

