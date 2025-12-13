/**
 * Firebase Cloud Functions entry point
 * 
 * Exports:
 * - onContactWrite: Triggered when contacts are written
 * - recomputeGhostQuality: Scheduled function to recompute ghost quality scores
 */

import * as admin from 'firebase-admin'

// Initialize Firebase Admin
admin.initializeApp()

// Export functions
export { onContactWrite } from './onContactWrite'
export { recomputeGhostQuality } from './recomputeGhostQuality'
export { repairMyHandle } from './repairMyHandle'

// Export transaction functions
export { tx_createBankDepositRequest } from './tx/createBankDepositRequest'
export { tx_userMarkDepositSent } from './tx/userMarkDepositSent'
export { tx_receiverConfirmDeposit } from './tx/receiverConfirmDeposit'
export { tx_creditAndLock } from './tx/creditAndLock'
export { tx_unlockSweep } from './tx/unlockSweep'
export { tx_appendUserMessage } from './tx/appendUserMessage'
export { tx_setWithdrawalAddress } from './tx/setWithdrawalAddress'
export { tx_userConfirmWithdrawal } from './tx/userConfirmWithdrawal'
export { tx_sendUsdtTron } from './tx/sendUsdtTron'

