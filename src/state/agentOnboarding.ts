/**
 * Agent Onboarding State
 * Manages agent onboarding flow state (UI-only for now)
 */

import { create } from 'zustand'

export type AgentInductionStep = 
  | 'welcome'           // Message 1: Welcome & framing
  | 'identity'          // Message 2: Identity requirements
  | 'float'             // Message 3: Cash amount declaration
  | 'credit_explanation' // Message 4: Explain agent credit
  | 'shift_framing'     // Message 5: First work shift & countdown
  | 'confirmation'      // Message 6: Confirmation & notification
  | null                // No active induction

export type AgentOnboardingState = {
  // Onboarding completion
  hasCompletedAgentOnboarding: boolean
  
  // Induction flow state
  agentInductionStep: AgentInductionStep
  
  // KYC/Identity flags
  photoUploaded: boolean
  idUploaded: boolean
  selfieUploaded: boolean
  
  // Float declaration
  agentFloatToday: number | null // Cash amount in ZAR
  
  // Clock-in state
  agentClockedIn: boolean
  clockInEndTime: number | null // Date.now() + 4 hours (milliseconds)
  
  // Actions
  startAgentInduction: () => void
  setInductionStep: (step: AgentInductionStep) => void
  markPhotoUploaded: () => void
  markIdUploaded: () => void
  markSelfieUploaded: () => void
  setAgentFloat: (amount: number) => void
  clockInAgent: () => void
  clockOutAgent: () => void
  resetInduction: () => void
}

export const useAgentOnboardingStore = create<AgentOnboardingState>((set, get) => ({
  hasCompletedAgentOnboarding: false,
  agentInductionStep: null,
  photoUploaded: false,
  idUploaded: false,
  selfieUploaded: false,
  agentFloatToday: null,
  agentClockedIn: false,
  clockInEndTime: null,
  
  startAgentInduction: () => {
    set({
      agentInductionStep: 'welcome',
    })
  },
  
  setInductionStep: (step: AgentInductionStep) => {
    set({ agentInductionStep: step })
  },
  
  markPhotoUploaded: () => {
    set({ photoUploaded: true })
  },
  
  markIdUploaded: () => {
    set({ idUploaded: true })
  },
  
  markSelfieUploaded: () => {
    set({ selfieUploaded: true })
  },
  
  setAgentFloat: (amount: number) => {
    set({ agentFloatToday: amount })
  },
  
  clockInAgent: () => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
    set({
      agentClockedIn: true,
      clockInEndTime: Date.now() + FOUR_HOURS_MS,
      hasCompletedAgentOnboarding: true,
      agentInductionStep: null, // Close induction flow
    })
  },
  
  clockOutAgent: () => {
    set({
      agentClockedIn: false,
      clockInEndTime: null,
    })
  },
  
  resetInduction: () => {
    set({
      agentInductionStep: null,
    })
  },
}))

