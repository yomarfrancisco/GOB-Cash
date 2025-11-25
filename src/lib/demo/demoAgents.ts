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
    avatar: '/processed-avatars/avatar_naledi.png',
    lat: -26.2041,
    lng: 28.0473, // Johannesburg
  },
  {
    id: 'demo-joao',
    name: 'João',
    handle: '@joao',
    avatar: '/processed-avatars/avatar_joao.png',
    lat: -25.9692,
    lng: 32.5732, // Maputo
  },
  {
    id: 'demo-thabo',
    name: 'Thabo',
    handle: '@thabo',
    avatar: '/processed-avatars/avatar_thabo.png',
    lat: -33.9249,
    lng: 18.4241, // Cape Town
  },
  {
    id: 'demo-sarah',
    name: 'Sarah',
    handle: '@sarah',
    avatar: '/processed-avatars/avatar_sarah.png',
    lat: -29.8587,
    lng: 31.0218, // Durban
  },
]

