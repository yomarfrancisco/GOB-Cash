/**
 * Key SADC City Avatars
 * Defines one avatar per key SADC city to show regional coverage on the static post-sign-in map view
 */

export type KeyCityAvatar = {
  id: string
  name: string
  city: string
  country: string
  avatar: string // image path
  lat: number
  lng: number
}

export const KEY_CITY_AVATARS: KeyCityAvatar[] = [
  // South Africa - already covered by DEMO_AGENTS (Johannesburg, Cape Town, Durban)
  // Adding additional coverage if needed

  // Mozambique
  {
    id: 'key-city-beira',
    name: 'Beira',
    city: 'Beira',
    country: 'Mozambique',
    avatar: '/assets/avatar_agent1.png', // Photo avatar for major city
    lat: -19.8333,
    lng: 34.8500,
  },

  // Zimbabwe
  {
    id: 'key-city-harare',
    name: 'Harare',
    city: 'Harare',
    country: 'Zimbabwe',
    avatar: '/assets/avatar_agent2.png', // Photo avatar for capital
    lat: -17.8292,
    lng: 31.0522,
  },

  // Zambia
  {
    id: 'key-city-lusaka',
    name: 'Lusaka',
    city: 'Lusaka',
    country: 'Zambia',
    avatar: '/assets/avatar_agent3.png', // Photo avatar for capital
    lat: -15.3875,
    lng: 28.3228,
  },

  // Namibia
  {
    id: 'key-city-windhoek',
    name: 'Windhoek',
    city: 'Windhoek',
    country: 'Namibia',
    avatar: '/assets/avatar_agent4.png', // Photo avatar for capital
    lat: -22.5609,
    lng: 17.0658,
  },

  // Botswana
  {
    id: 'key-city-gaborone',
    name: 'Gaborone',
    city: 'Gaborone',
    country: 'Botswana',
    avatar: '/generated-avatars/initials-ring/avatar-A.png', // Letter-ring avatar
    lat: -24.6282,
    lng: 25.9231,
  },

  // Angola
  {
    id: 'key-city-luanda',
    name: 'Luanda',
    city: 'Luanda',
    country: 'Angola',
    avatar: '/assets/avatar_agent5.png', // Photo avatar for major capital
    lat: -8.8383,
    lng: 13.2344,
  },

  // Tanzania
  {
    id: 'key-city-dar-es-salaam',
    name: 'Dar es Salaam',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    avatar: '/assets/avatar_agent6.png', // Photo avatar for major city
    lat: -6.7924,
    lng: 39.2083,
  },

  // DRC (SADC-adjacent)
  {
    id: 'key-city-kinshasa',
    name: 'Kinshasa',
    city: 'Kinshasa',
    country: 'DRC',
    avatar: '/generated-avatars/initials-ring/avatar-C.png', // Letter-ring avatar
    lat: -4.3276,
    lng: 15.3136,
  },
]

