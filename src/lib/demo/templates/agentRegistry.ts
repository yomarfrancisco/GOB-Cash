/**
 * Notification System v2.0 - Agent Registry
 * Defines 10 demo agents with locations, avatars, and specialties
 */

export type AgentProfile = {
  id: string // e.g., "thabo", "lindiwe"
  name: string // Display name (e.g., "@thabo")
  handle: string // Full handle (e.g., "@thabo")
  city: string // e.g., "Johannesburg"
  country: string // e.g., "South Africa"
  avatar: string // Avatar path
  lat: number
  lng: number
  productivity: number // 0-100, for ranking
  specialties: string[] // e.g., ["cross-border", "large-transactions"]
}

export const AGENT_REGISTRY: AgentProfile[] = [
  {
    id: 'thabo',
    name: '@thabo',
    handle: '@thabo',
    city: 'Johannesburg',
    country: 'South Africa',
    avatar: '/assets/avatar_agent5.png',
    lat: -26.2041,
    lng: 28.0473,
    productivity: 85,
    specialties: ['reliable', 'steady-earner']
  },
  {
    id: 'lindiwe',
    name: '@lindiwe',
    handle: '@lindiwe',
    city: 'Durban',
    country: 'South Africa',
    avatar: '/assets/avatar_agent6.png',
    lat: -29.8587,
    lng: 31.0218,
    productivity: 95,
    specialties: ['high-performer', 'top-productivity']
  },
  {
    id: 'sipho',
    name: '@sipho',
    handle: '@sipho',
    city: 'Pretoria',
    country: 'South Africa',
    avatar: '/assets/avatar_agent7.png',
    lat: -25.7479,
    lng: 28.2293,
    productivity: 70,
    specialties: ['rising', 'fast-growing']
  },
  {
    id: 'grace',
    name: '@grace',
    handle: '@grace',
    city: 'Soweto',
    country: 'South Africa',
    avatar: '/assets/avatar_agent8.png',
    lat: -26.2485,
    lng: 27.8540,
    productivity: 98,
    specialties: ['veteran', 'highest-rated']
  },
  {
    id: 'tendai',
    name: '@tendai',
    handle: '@tendai',
    city: 'Harare',
    country: 'Zimbabwe',
    avatar: '/assets/avatar_agent1.png',
    lat: -17.8292,
    lng: 31.0522,
    productivity: 88,
    specialties: ['cross-border', 'harare-corridor']
  },
  {
    id: 'blessing',
    name: '@blessing',
    handle: '@blessing',
    city: 'Maputo',
    country: 'Mozambique',
    avatar: '/assets/avatar_agent2.png',
    lat: -25.9692,
    lng: 32.5732,
    productivity: 82,
    specialties: ['cross-border', 'maputo-corridor']
  },
  {
    id: 'chipo',
    name: '@chipo',
    handle: '@chipo',
    city: 'Bulawayo',
    country: 'Zimbabwe',
    avatar: '/assets/avatar_agent3.png',
    lat: -20.1325,
    lng: 28.5851,
    productivity: 75,
    specialties: ['consistent', 'reliable']
  },
  {
    id: 'nomsa',
    name: '@nomsa',
    handle: '@nomsa',
    city: 'Cape Town',
    country: 'South Africa',
    avatar: '/assets/avatar_agent4.png',
    lat: -33.9249,
    lng: 18.4241,
    productivity: 90,
    specialties: ['large-transactions', 'high-volume']
  },
  {
    id: 'tawanda',
    name: '@tawanda',
    handle: '@tawanda',
    city: 'Mutare',
    country: 'Zimbabwe',
    avatar: '/assets/avatar_agent1.png',
    lat: -18.9707,
    lng: 32.6709,
    productivity: 80,
    specialties: ['border-specialist', 'cross-border']
  },
  {
    id: 'fatima',
    name: '@fatima',
    handle: '@fatima',
    city: 'Inhambane',
    country: 'Mozambique',
    avatar: '/assets/avatar_agent2.png',
    lat: -23.8650,
    lng: 35.3833,
    productivity: 78,
    specialties: ['coastal-corridor', 'cross-border']
  },
  {
    id: 'kwame',
    name: '@kwame',
    handle: '@kwame',
    city: 'Accra',
    country: 'Ghana',
    avatar: '/assets/avatar_agent9.png',
    lat: 5.6037,
    lng: -0.1870,
    productivity: 87,
    specialties: ['west-africa', 'high-volume']
  },
  {
    id: 'amina',
    name: '@amina',
    handle: '@amina',
    city: 'Nairobi',
    country: 'Kenya',
    avatar: '/assets/avatar_agent10.png',
    lat: -1.2921,
    lng: 36.8219,
    productivity: 92,
    specialties: ['east-africa', 'cross-border']
  },
  {
    id: 'joseph',
    name: '@joseph',
    handle: '@joseph',
    city: 'Lagos',
    country: 'Nigeria',
    avatar: '/assets/avatar_agent11.png',
    lat: 6.5244,
    lng: 3.3792,
    productivity: 89,
    specialties: ['west-africa', 'large-transactions']
  },
  {
    id: 'zainab',
    name: '@zainab',
    handle: '@zainab',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    avatar: '/assets/avatar_agent12.png',
    lat: -6.7924,
    lng: 39.2083,
    productivity: 85,
    specialties: ['east-africa', 'reliable']
  },
  {
    id: 'david',
    name: '@david',
    handle: '@david',
    city: 'Kampala',
    country: 'Uganda',
    avatar: '/assets/avatar_agent13.png',
    lat: 0.3476,
    lng: 32.5825,
    productivity: 86,
    specialties: ['east-africa', 'cross-border']
  },
  {
    id: 'mary',
    name: '@mary',
    handle: '@mary',
    city: 'Kigali',
    country: 'Rwanda',
    avatar: '/assets/avatar_agent14.png',
    lat: -1.9441,
    lng: 30.0619,
    productivity: 91,
    specialties: ['east-africa', 'high-volume']
  },
  {
    id: 'peter',
    name: '@peter',
    handle: '@peter',
    city: 'Addis Ababa',
    country: 'Ethiopia',
    avatar: '/assets/avatar_agent15.png',
    lat: 9.1450,
    lng: 38.7617,
    productivity: 84,
    specialties: ['east-africa', 'reliable']
  },
  {
    id: 'ariel',
    name: '@ariel',
    handle: '@ariel',
    city: 'Johannesburg',
    country: 'South Africa',
    avatar: '/assets/avatar-ariel.png',
    lat: -26.2041,
    lng: 28.0473,
    productivity: 93,
    specialties: ['high-performer', 'reliable']
  }
]

// City coordinates for cross-border notifications
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'johannesburg': { lat: -26.2041, lng: 28.0473 },
  'durban': { lat: -29.8587, lng: 31.0218 },
  'cape-town': { lat: -33.9249, lng: 18.4241 },
  'pretoria': { lat: -25.7479, lng: 28.2293 },
  'soweto': { lat: -26.2485, lng: 27.8540 },
  'sandton': { lat: -26.1076, lng: 28.0567 },
  'harare': { lat: -17.8292, lng: 31.0522 },
  'bulawayo': { lat: -20.1325, lng: 28.5851 },
  'mutare': { lat: -18.9707, lng: 32.6709 },
  'maputo': { lat: -25.9692, lng: 32.5732 },
  'beira': { lat: -19.8436, lng: 34.8389 },
  'inhambane': { lat: -23.8650, lng: 35.3833 },
  'lusaka': { lat: -15.3875, lng: 28.3228 },
  'blantyre': { lat: -15.7667, lng: 35.0168 }
}

