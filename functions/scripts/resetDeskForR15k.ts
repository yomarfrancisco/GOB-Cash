/**
 * Force a fresh conversion-routing desk run under the R15k payment ceiling.
 * Uses the same startNewTest + issueCycle path as the live admin callable.
 */
import * as admin from 'firebase-admin'

const PROJECT = 'gobankless-dev'

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT })
  }
  // Import after admin init — module captures firestore() at load.
  const { forceFreshDeskRun } = await import('../src/tx/adminConversionRouting')
  const { OPERATING_POLICY_V1 } = await import('../src/operatingCalendar/operatingPolicyV1')
  const { DESK_MONTH_TARGET_ZAR } = await import('../src/routing/deskMonth')

  const summary = await forceFreshDeskRun({
    capitalZar: DESK_MONTH_TARGET_ZAR,
    note: `October R${DESK_MONTH_TARGET_ZAR} month · max R${OPERATING_POLICY_V1.payment.maxAmountZar}`,
  })
  console.log(
    JSON.stringify(
      {
        ok: true,
        monthTargetZar: DESK_MONTH_TARGET_ZAR,
        maxPaymentZar: OPERATING_POLICY_V1.payment.maxAmountZar,
        summary,
        instruction: 'Pull to refresh on all devices, then tap Next 24h through the month.',
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
