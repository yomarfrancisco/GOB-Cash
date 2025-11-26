/**
 * Demo Initial Avatars for Map
 * Weighted city-based placement with proportional sampling
 * Johannesburg gets the most avatars (highest weight)
 */

export type DemoInitialAvatar = {
  id: string
  name: string
  avatarSrc: string
  lng: number
  lat: number
  cityId?: string
}

export type KeyCity = {
  id: string
  city: string
  country: string
  lat: number
  lng: number
  weight: number // relative number of avatars to place here
}

export const KEY_CITIES: KeyCity[] = [
  // 🇿🇦 South Africa – JHB should get the most avatars
  {
    id: "johannesburg",
    city: "Johannesburg",
    country: "South Africa",
    lat: -26.2041,
    lng: 28.0473,
    weight: 12, // 🔥 highest weight = most avatars
  },
  {
    id: "cape-town",
    city: "Cape Town",
    country: "South Africa",
    lat: -33.9249,
    lng: 18.4241,
    weight: 4,
  },
  {
    id: "durban",
    city: "Durban",
    country: "South Africa",
    lat: -29.8587,
    lng: 31.0218,
    weight: 4,
  },
  {
    id: "nelspruit",
    city: "Nelspruit (Mbombela)",
    country: "South Africa",
    lat: -25.4745,
    lng: 30.969,
    weight: 2,
  },

  // 🇲🇿 Mozambique
  {
    id: "maputo",
    city: "Maputo",
    country: "Mozambique",
    lat: -25.9653,
    lng: 32.5892,
    weight: 4,
  },
  {
    id: "beira",
    city: "Beira",
    country: "Mozambique",
    lat: -19.8333,
    lng: 34.85,
    weight: 2,
  },
  {
    id: "nampula",
    city: "Nampula",
    country: "Mozambique",
    lat: -15.1165,
    lng: 39.2666,
    weight: 2,
  },
  {
    id: "quelimane",
    city: "Quelimane",
    country: "Mozambique",
    lat: -17.8786,
    lng: 36.8883,
    weight: 1,
  },
  {
    id: "nacala",
    city: "Nacala",
    country: "Mozambique",
    lat: -14.5627,
    lng: 40.6853,
    weight: 1,
  },
  {
    id: "chimoio",
    city: "Chimoio",
    country: "Mozambique",
    lat: -19.118,
    lng: 33.4834,
    weight: 1,
  },

  // 🇿🇼 Zimbabwe
  {
    id: "harare",
    city: "Harare",
    country: "Zimbabwe",
    lat: -17.8292,
    lng: 31.0522,
    weight: 3,
  },
  {
    id: "bulawayo",
    city: "Bulawayo",
    country: "Zimbabwe",
    lat: -20.1575,
    lng: 28.5786,
    weight: 2,
  },
  {
    id: "mutare",
    city: "Mutare",
    country: "Zimbabwe",
    lat: -18.9707,
    lng: 32.6709,
    weight: 1,
  },

  // 🇿🇲 Zambia
  {
    id: "lusaka",
    city: "Lusaka",
    country: "Zambia",
    lat: -15.3875,
    lng: 28.3228,
    weight: 3,
  },
  {
    id: "ndola",
    city: "Ndola",
    country: "Zambia",
    lat: -12.969,
    lng: 28.635,
    weight: 1,
  },
  {
    id: "livingstone",
    city: "Livingstone",
    country: "Zambia",
    lat: -17.8433,
    lng: 25.8429,
    weight: 2,
  },

  // 🇳🇦 Namibia
  {
    id: "windhoek",
    city: "Windhoek",
    country: "Namibia",
    lat: -22.5597,
    lng: 17.0832,
    weight: 2,
  },
  {
    id: "walvis-bay",
    city: "Walvis Bay",
    country: "Namibia",
    lat: -22.9576,
    lng: 14.5053,
    weight: 1,
  },
  {
    id: "swakopmund",
    city: "Swakopmund",
    country: "Namibia",
    lat: -22.6847,
    lng: 14.525,
    weight: 1,
  },

  // 🇧🇼 Botswana
  {
    id: "gaborone",
    city: "Gaborone",
    country: "Botswana",
    lat: -24.6282,
    lng: 25.9231,
    weight: 2,
  },
  {
    id: "francistown",
    city: "Francistown",
    country: "Botswana",
    lat: -21.17,
    lng: 27.5089,
    weight: 1,
  },
  {
    id: "maun",
    city: "Maun",
    country: "Botswana",
    lat: -19.9833,
    lng: 23.4167,
    weight: 1,
  },

  // 🇱🇸 Lesotho
  {
    id: "maseru",
    city: "Maseru",
    country: "Lesotho",
    lat: -29.3158,
    lng: 27.486,
    weight: 2,
  },
  {
    id: "teyateyaneng",
    city: "Teyateyaneng",
    country: "Lesotho",
    lat: -29.1472,
    lng: 27.7489,
    weight: 1,
  },
  {
    id: "mafeteng",
    city: "Mafeteng",
    country: "Lesotho",
    lat: -29.823,
    lng: 27.237,
    weight: 1,
  },

  // 🇪🇸 Eswatini
  {
    id: "mbabane",
    city: "Mbabane",
    country: "Eswatini",
    lat: -26.3054,
    lng: 31.1367,
    weight: 2,
  },
  {
    id: "manzini",
    city: "Manzini",
    country: "Eswatini",
    lat: -26.4988,
    lng: 31.38,
    weight: 1,
  },
  {
    id: "siteki",
    city: "Siteki",
    country: "Eswatini",
    lat: -26.4542,
    lng: 31.9525,
    weight: 1,
  },

  // 🇲🇼 Malawi
  {
    id: "lilongwe",
    city: "Lilongwe",
    country: "Malawi",
    lat: -13.9626,
    lng: 33.7741,
    weight: 2,
  },
  {
    id: "blantyre",
    city: "Blantyre",
    country: "Malawi",
    lat: -15.7861,
    lng: 35.0058,
    weight: 2,
  },
  {
    id: "mzuzu",
    city: "Mzuzu",
    country: "Malawi",
    lat: -11.465,
    lng: 34.0207,
    weight: 1,
  },

  // 🇹🇿 Tanzania
  {
    id: "dar-es-salaam",
    city: "Dar es Salaam",
    country: "Tanzania",
    lat: -6.7924,
    lng: 39.2083,
    weight: 2,
  },
  {
    id: "dodoma",
    city: "Dodoma",
    country: "Tanzania",
    lat: -6.163,
    lng: 35.7516,
    weight: 1,
  },
  {
    id: "mwanza",
    city: "Mwanza",
    country: "Tanzania",
    lat: -2.5164,
    lng: 32.9175,
    weight: 1,
  },

  // 🇨🇩 DRC
  {
    id: "kinshasa",
    city: "Kinshasa",
    country: "DRC",
    lat: -4.4419,
    lng: 15.2663,
    weight: 2,
  },
  {
    id: "lubumbashi",
    city: "Lubumbashi",
    country: "DRC",
    lat: -11.687,
    lng: 27.5026,
    weight: 1,
  },
  {
    id: "kisangani",
    city: "Kisangani",
    country: "DRC",
    lat: 0.5167,
    lng: 25.2,
    weight: 1,
  },

  // 🇨🇬 Republic of Congo
  {
    id: "brazzaville",
    city: "Brazzaville",
    country: "Republic of Congo",
    lat: -4.2694,
    lng: 15.2714,
    weight: 1,
  },
  {
    id: "pointe-noire",
    city: "Pointe-Noire",
    country: "Republic of Congo",
    lat: -4.788,
    lng: 11.865,
    weight: 1,
  },
  {
    id: "dolisie",
    city: "Dolisie",
    country: "Republic of Congo",
    lat: -4.1983,
    lng: 12.6666,
    weight: 1,
  },

  // 🇺🇬 Uganda
  {
    id: "kampala",
    city: "Kampala",
    country: "Uganda",
    lat: 0.3476,
    lng: 32.5825,
    weight: 2,
  },
  {
    id: "gulu",
    city: "Gulu",
    country: "Uganda",
    lat: 2.7746,
    lng: 32.2989,
    weight: 1,
  },
  {
    id: "mbarara",
    city: "Mbarara",
    country: "Uganda",
    lat: -0.6076,
    lng: 30.6545,
    weight: 1,
  },
]

// Initial letters (A, C, E, G, I, K, M, O, Q, S, U, W, Y)
const INITIAL_LETTERS = ['A', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'Q', 'S', 'U', 'W', 'Y']

// SADC inland bounding box (safe zone to prevent ocean placement)
const SADC_SAFE_BBOX = {
  minLng: 11,
  maxLng: 40,
  minLat: -35,
  maxLat: 3,
}

// Clamp coordinate to safe inland bounds, pulling back toward city center if needed
function clampToInlandBounds(
  lat: number,
  lng: number,
  cityLat: number,
  cityLng: number
): { lat: number; lng: number } {
  let clampedLat = lat
  let clampedLng = lng

  // If outside bounds, move toward city center
  if (lat < SADC_SAFE_BBOX.minLat) {
    clampedLat = Math.max(SADC_SAFE_BBOX.minLat, cityLat - 0.02)
  } else if (lat > SADC_SAFE_BBOX.maxLat) {
    clampedLat = Math.min(SADC_SAFE_BBOX.maxLat, cityLat + 0.02)
  }

  if (lng < SADC_SAFE_BBOX.minLng) {
    clampedLng = Math.max(SADC_SAFE_BBOX.minLng, cityLng - 0.02)
  } else if (lng > SADC_SAFE_BBOX.maxLng) {
    clampedLng = Math.min(SADC_SAFE_BBOX.maxLng, cityLng + 0.02)
  }

  return { lat: clampedLat, lng: clampedLng }
}

// Generate weighted city sample (proportional to weight)
function sampleCityByWeight(cities: KeyCity[]): KeyCity {
  const totalWeight = cities.reduce((sum, city) => sum + city.weight, 0)
  let random = Math.random() * totalWeight

  for (const city of cities) {
    random -= city.weight
    if (random <= 0) {
      return city
    }
  }

  // Fallback (shouldn't happen)
  return cities[0]
}

// Generate avatar with tiny jitter and ocean protection
function generateAvatarAtCity(city: KeyCity, index: number): DemoInitialAvatar {
  const letter = INITIAL_LETTERS[index % INITIAL_LETTERS.length]
  
  // Tiny random jitter: ±0.05° (~5.5km)
  const jitterLat = (Math.random() - 0.5) * 0.1 // ±0.05
  const jitterLng = (Math.random() - 0.5) * 0.1 // ±0.05
  
  let lat = city.lat + jitterLat
  let lng = city.lng + jitterLng
  
  // Clamp to inland bounds if jitter pushes into ocean
  const clamped = clampToInlandBounds(lat, lng, city.lat, city.lng)
  lat = clamped.lat
  lng = clamped.lng

  return {
    id: `initial-${letter}-${city.id}-${index}`,
    name: letter,
    avatarSrc: `/generated-avatars/initials-ring/avatar-${letter}.png`,
    lng,
    lat,
    cityId: city.id,
  }
}

// Generate 80 avatars (can be adjusted to 100 if needed)
const INITIAL_AVATAR_COUNT = 80

// Generate avatars by weighted sampling
export const DEMO_INITIAL_AVATARS: DemoInitialAvatar[] = Array.from({ length: INITIAL_AVATAR_COUNT }).map((_, i) => {
  const city = sampleCityByWeight(KEY_CITIES)
  return generateAvatarAtCity(city, i)
})
