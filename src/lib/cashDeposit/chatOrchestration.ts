/**
 * Cash Deposit/Withdrawal Chat Orchestration
 * Helper functions for opening Ama chat with cash deposit or withdrawal scenario
 */

import { useFinancialInboxStore, type PaymentFlowSummaryMode } from '@/state/financialInbox'
import { useAgentOnboardingStore } from '@/state/agentOnboarding'
import { formatZAR } from '@/lib/money'
import { useUserProfileStore } from '@/store/userProfile'
import { useNotificationStore } from '@/store/notifications'

const PORTFOLIO_MANAGER_THREAD_ID = 'portfolio-manager'

/**
 * Opens Ama's chat thread and ensures the cash deposit or withdrawal scenario is active
 * This is called after user submits amount in convert/helicopter flow
 */
export function openAmaChatWithScenario(scenarioType: 'cash_deposit' | 'cash_withdrawal'): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for payment confirmation scenarios
 * This is called after user submits payment details from $ button flow
 */
export function openAmaChatWithPaymentScenario(
  mode: PaymentFlowSummaryMode,
  amountZAR: number,
  handle: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Store payment flow summary
  const id = `${Date.now()}-${mode}-${handle}`
  store.setLastPaymentFlow({
    id,
    mode,
    amountZAR,
    handle,
    createdAt: Date.now(),
  })
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Format amount for display
  const amountLabel = formatZAR(amountZAR)
  
  // Seed initial confirmation messages based on mode
  if (mode === 'pay') {
    // Send first message immediately
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Payment sent`)
    
    // Send remaining messages with delays to simulate typing
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your payment of ${amountLabel} to ${handle} has been sent successfully.`)
    }, 800)
    
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `I'll generate a proof of payment for you here in a moment.`)
    }, 1600)
  } else {
    // Send first message immediately
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Payment request created`)
    
    // Send remaining messages with delays to simulate typing
    setTimeout(() => {
      store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your request for ${amountLabel} from ${handle} has been sent.`)
    }, 800)
  }
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for card deposit confirmation scenarios
 * This is called after user selects destination account for card deposit
 */
export function openAmaChatWithCardDepositScenario(
  amountZAR: number,
  accountLabel: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Format amount for display
  const amountLabel = formatZAR(amountZAR)
  
  // Seed initial confirmation messages
  // Send first message immediately
  store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `I've started your card deposit.`)
  
  // Send remaining messages with delays to simulate typing
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Your card deposit of ${amountLabel} into ${accountLabel} has been initiated.`)
  }, 800)
  
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `The funds should appear in your account shortly.`)
  }, 1600)
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for sponsorship scenarios
 * This is called after user submits sponsorship amount and frequency from profile Sponsor button
 */
export function openAmaChatWithSponsorshipScenario(
  frequency: 'weekly' | 'monthly',
  amountZAR: number,
  handle: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Format amount for display
  const amountLabel = formatZAR(amountZAR)
  
  // Seed initial confirmation messages based on frequency
  // Send first message immediately
  store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `Sponsorship created`)
  
  // Send remaining messages with delays to simulate typing
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `You've set up a ${frequency} sponsorship of ${amountLabel} for ${handle}.`)
  }, 800)
  
  setTimeout(() => {
    store.sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', `I'll send you a proof of payment for your first sponsorship transaction now and keep you updated each time a payment runs.`)
  }, 1600)
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Opens Ama's chat thread for agent induction flow
 * This is called when user clicks "Start earning as a cash agent" button
 */
export function openAmaChatWithAgentInduction(): void {
  const store = useFinancialInboxStore.getState()
  const agentStore = useAgentOnboardingStore.getState()
  
  // Ensure the portfolio manager thread exists
  store.ensurePortfolioManagerThread()
  
  // Start the agent induction flow
  agentStore.startAgentInduction()
  
  // Send Message 1: Welcome & framing
  store.sendMessage(
    PORTFOLIO_MANAGER_THREAD_ID,
    'ai',
    `Hey 👋\n\nYou're about to earn as a cash agent.\n\nIn simple terms:\n\n• You help people turn cash ↔ digital\n\n• You earn a commission on each transaction\n\n• And over time, you build agent credit so we can trust you with more volume.\n\nBefore we start, I need to check a few basics.`
  )
  
  // Open the inbox sheet
  store.openInbox()
  
  // Switch to chat view and set active thread to Ama
  store.openChatSheet(PORTFOLIO_MANAGER_THREAD_ID)
}

/**
 * Handles agent induction button clicks
 * This processes user actions in the induction flow
 */
export function handleAgentInductionAction(action: string): void {
  const agentStore = useAgentOnboardingStore.getState()
  const store = useFinancialInboxStore.getState()
  const profileStore = useUserProfileStore.getState()
  
  const currentStep = agentStore.agentInductionStep
  const floatAmount = agentStore.agentFloatToday
  const handle = profileStore.profile?.userHandle || 'agent'
  
  if (action === 'not_now') {
    // Close induction and return to profile
    agentStore.resetInduction()
    return
  }
  
  if (action === 'want_to_earn') {
    // Move to Message 2: Identity requirements
    agentStore.setInductionStep('identity')
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'ai',
      `Great. To work as an agent, people need to recognize and trust you.\n\nI'll need 3 things to set up your agent profile:\n\n1. A clear face photo (your public profile picture)\n\n2. A photo of your ID or passport\n\n3. A selfie for verification\n\nYour handle is what customers see. Your real name and documents stay private and are used only for trust and internal checks.`
    )
    return
  }
  
  if (action === 'take_profile_photo') {
    // TODO: Open camera/file picker modal
    // For now, just mark as uploaded
    agentStore.markPhotoUploaded()
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'Photo uploaded'
    )
    setTimeout(() => {
      store.sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        '✓ Profile photo received'
      )
    }, 500)
    return
  }
  
  if (action === 'scan_id') {
    // TODO: Open camera/file picker modal
    agentStore.markIdUploaded()
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'ID uploaded'
    )
    setTimeout(() => {
      store.sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        '✓ ID/passport received'
      )
    }, 500)
    return
  }
  
  if (action === 'take_selfie') {
    // TODO: Open camera modal
    agentStore.markSelfieUploaded()
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'Selfie uploaded'
    )
    setTimeout(() => {
      store.sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        '✓ Selfie received'
      )
    }, 500)
    
    // Check if all three are done, then move to next step
    setTimeout(() => {
      const state = useAgentOnboardingStore.getState()
      if (state.photoUploaded && state.idUploaded && state.selfieUploaded) {
        agentStore.setInductionStep('float')
        store.sendMessage(
          PORTFOLIO_MANAGER_THREAD_ID,
          'ai',
          `Perfect! All identity documents received.\n\nNow let's talk about cash you actually have available today.\n\nWhen someone nearby wants to withdraw, you'll need that cash in your hand.\n\nHow much cash could you realistically use to help people today?`
        )
      }
    }, 1000)
    return
  }
  
  if (action === 'done_for_now') {
    const state = useAgentOnboardingStore.getState()
    if (!state.photoUploaded || !state.idUploaded || !state.selfieUploaded) {
      store.sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        `You're almost there.\n\nTo protect both you and customers, I need all three: photo, ID, and selfie.\n\nOnce those are in, we can talk about your earnings.`
      )
    } else {
      // All done, move to float step
      agentStore.setInductionStep('float')
      store.sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        `Perfect! All identity documents received.\n\nNow let's talk about cash you actually have available today.\n\nWhen someone nearby wants to withdraw, you'll need that cash in your hand.\n\nHow much cash could you realistically use to help people today?`
      )
    }
    return
  }
  
  // Float amount quick picks
  if (action === 'float_200') {
    agentStore.setAgentFloat(200)
    agentStore.setInductionStep('credit_explanation')
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'R200'
    )
    setTimeout(() => {
      proceedToCreditExplanation(200)
    }, 500)
    return
  }
  
  if (action === 'float_500') {
    agentStore.setAgentFloat(500)
    agentStore.setInductionStep('credit_explanation')
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'R500'
    )
    setTimeout(() => {
      proceedToCreditExplanation(500)
    }, 500)
    return
  }
  
  if (action === 'float_1000') {
    agentStore.setAgentFloat(1000)
    agentStore.setInductionStep('credit_explanation')
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'R1,000'
    )
    setTimeout(() => {
      proceedToCreditExplanation(1000)
    }, 500)
    return
  }
  
  if (action === 'float_2000') {
    agentStore.setAgentFloat(2000)
    agentStore.setInductionStep('credit_explanation')
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'user',
      'R2,000+'
    )
    setTimeout(() => {
      proceedToCreditExplanation(2000)
    }, 500)
    return
  }
  
  if (action === 'float_custom') {
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'ai',
      `Type the amount you're comfortable using as cash today (in rand).\n\nExample: 350 or 1200.`
    )
    return
  }
  
  if (action === 'okay_makes_sense') {
    proceedToShiftFraming(floatAmount || 0)
    return
  }
  
  if (action === 'clock_me_in') {
    const amount = floatAmount || 0
    agentStore.clockInAgent()
    
    const amountLabel = formatZAR(amount)
    
    // Message 6: Confirmation
    store.sendMessage(
      PORTFOLIO_MANAGER_THREAD_ID,
      'ai',
      `You're in ✅\n\nFor the next 4 hours, you're live as an agent with:\n\n• ${amountLabel} cash\n\n• A starter agent credit boost\n\nI'll show you requests from people nearby, and I'll ask them to rate you after each transaction.\n\nYou can see your status and time left on your Agent Credit card on the home screen.`
    )
    
    // Send notification stub
    setTimeout(() => {
      const notificationStore = useNotificationStore.getState()
      // @ts-ignore - pushNotification exists but may not be in type
      if (notificationStore.pushNotification) {
        notificationStore.pushNotification({
          kind: 'payment_received', // Reuse existing type for now
          title: '🟢 Ama',
          body: `@${handle} is now available as a cash agent near you with ${amountLabel} for the next 4 hours.`,
          actor: {
            type: 'ai_manager',
            avatar: '/assets/Brics-girl-blue.png',
            name: 'Ama',
          },
        })
      }
    }, 2000)
    
    return
  }
  
  if (action === 'not_yet') {
    agentStore.resetInduction()
    return
  }
}

function proceedToCreditExplanation(floatAmount: number): void {
  const store = useFinancialInboxStore.getState()
  const agentStore = useAgentOnboardingStore.getState()
  
  agentStore.setInductionStep('credit_explanation')
  
  const amountLabel = formatZAR(floatAmount)
  
  store.sendMessage(
    PORTFOLIO_MANAGER_THREAD_ID,
    'ai',
    `Perfect. I've noted that you're starting today with ${amountLabel} in cash.\n\nHere's how your agent credit works in simple terms:\n\n• We start you off with a small credit boost on top of your own cash\n\n• As you complete safe, on-time transactions, your credit can grow\n\n• If you go offline for long periods, your credit slowly decays until you check in again\n\nThis is how we protect customers and help good agents grow quickly.`
  )
}

function proceedToShiftFraming(floatAmount: number): void {
  const store = useFinancialInboxStore.getState()
  const agentStore = useAgentOnboardingStore.getState()
  
  agentStore.setInductionStep('shift_framing')
  
  const amountLabel = formatZAR(floatAmount)
  
  store.sendMessage(
    PORTFOLIO_MANAGER_THREAD_ID,
    'ai',
    `When you clock in, you're telling the network:\n\n"I'm available for about 4 hours with ${amountLabel} in cash."\n\nFor this first session:\n\n• You'll see a 4-hour timer on your Agent Credit card\n\n• During that time, I'll try to match you with nearby people who need cash ↔ digital\n\n• Each safe transaction you complete boosts your standing and future limits\n\nReady to clock in and start your first session?`
  )
}
