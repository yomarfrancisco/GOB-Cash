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
export { onUserWrite, directory_syncMyRecord } from './syncDirectoryForUser'
export { syncUserToGlobalContacts } from './syncUserToGlobalContacts'

// Export transaction functions
export { tx_createBankDepositRequest } from './tx/createBankDepositRequest'
export { tx_createPaymentAndSettle } from './tx/createPaymentAndSettle'
export { tx_userMarkDepositSent } from './tx/userMarkDepositSent'
export { onTxActionCreate } from './tx/onTxActionCreate'
export { tx_receiverConfirmDeposit } from './tx/receiverConfirmDeposit'
export { tx_creditAndLock } from './tx/creditAndLock'
export { tx_unlockSweep } from './tx/unlockSweep'
export { tx_appendUserMessage } from './tx/appendUserMessage'
export { tx_appendSambaMessage } from './tx/appendSambaMessage'
export { tx_appendEmaMessage } from './tx/appendEmaMessage'
// export { onDepositSentEmail } from './tx/onDepositSentEmail' // Disabled - email now sent from onTxActionCreate and tx_userMarkDepositSent
export { tx_setWithdrawalAddress } from './tx/setWithdrawalAddress'
export { tx_setWithdrawalAddressCandidate } from './tx/setWithdrawalAddressCandidate'
export { tx_userConfirmWithdrawal } from './tx/userConfirmWithdrawal'
export { tx_sendUsdtTron } from './tx/sendUsdtTron'
export { tx_timeoutSweep } from './tx/timeoutSweep'
export { tx_raiseDispute } from './tx/raiseDispute'
export { resetMyBalances } from './resetMyBalances'
export { admin_backfillDirectory } from './admin/backfillDirectory'
export { seedCoreAgentBalance } from './admin/seedCoreAgentBalance'
export { setCoreAgentBalance } from './admin/setCoreAgentBalance'
export { wallet_ensureTronAddress } from './tx/ensureTronAddress'
export { tx_withdrawTronUSDT } from './tx/withdrawTronUsdt'
export { getWithdrawalProof } from './tx/getWithdrawalProof'
export { tx_createBankWithdrawalRequest, onBankWithdrawalCreated } from './tx/createBankWithdrawalRequest'
export { getBankWithdrawalProof } from './tx/getBankWithdrawalProof'
export { tx_createInternalConversion } from './tx/createInternalConversion'
export { onDepositProofWrite, tx_confirmDepositProof } from './tx/onDepositProofWrite'

