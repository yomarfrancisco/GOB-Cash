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
    avatar: '/assets/avatar_agent5.png',
    lat: -26.2041,
    lng: 28.0473, // Johannesburg
  },
  {
    id: 'demo-joao',
    name: 'João',
    handle: '@joao',
    avatar: '/assets/avatar_agent6.png',
    lat: -25.9692,
    lng: 32.5732, // Maputo
  },
  {
    id: 'demo-thabo',
    name: 'Thabo',
    handle: '@thabo',
    avatar: '/assets/avatar_agent7.png',
    lat: -33.9249,
    lng: 18.4241, // Cape Town
  },
  {
    id: 'demo-sarah',
    name: 'Sarah',
    handle: '@sarah',
    avatar: '/assets/avatar_agent8.png',
    lat: -29.8587,
    lng: 31.0218, // Durban
  },
]

