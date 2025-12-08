/**
 * Notification System v2.0 - Character Definitions
 * Defines character personalities, avatars, and voice patterns
 */

export type CharacterConfig = {
  id: 'ama' | 'ariel' | 'network' | 'agent' | 'user'
  name: string // Display name (e.g., "$ama", "$ariel", "Network")
  avatar: string // Avatar path
  voice: {
    pronoun: 'I' | 'we' | 'they' | 'you' // For $ama: "I", for network: "we", for user: "you"
    tone: 'calm' | 'direct' | 'observational'
    sentenceLength: 'short' | 'medium' | 'long'
  }
}

export const CHARACTERS: Record<string, CharacterConfig> = {
  ama: {
    id: 'ama',
    name: '$ama',
    avatar: '/assets/Brics-girl-blue.png',
    voice: {
      pronoun: 'I',
      tone: 'calm',
      sentenceLength: 'medium'
    }
  },
  ariel: {
    id: 'ariel',
    name: '$ariel',
    avatar: '/assets/avatar-bricsASIA.png', // Bold, operations-focused (already used in inbox)
    voice: {
      pronoun: 'I',
      tone: 'direct',
      sentenceLength: 'short'
    }
  },
  network: {
    id: 'network',
    name: 'Network',
    avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png',
    voice: {
      pronoun: 'we',
      tone: 'observational',
      sentenceLength: 'medium'
    }
  },
  agent: {
    id: 'agent',
    name: 'Agent', // Will be replaced with actual agent handle
    avatar: '/assets/avatar_agent5.png', // Default, will be replaced
    voice: {
      pronoun: 'they',
      tone: 'direct',
      sentenceLength: 'short'
    }
  },
  user: {
    id: 'user',
    name: 'You',
    avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png', // Will use user's profile avatar
    voice: {
      pronoun: 'you',
      tone: 'direct',
      sentenceLength: 'short'
    }
  }
}

