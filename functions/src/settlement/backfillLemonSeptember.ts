/**
 * One-shot: raise Lemon Economics invoices for the September FNB swipes
 * already settled, marked raised-after-swipe.
 *
 * Run: npx tsx functions/src/settlement/backfillLemonSeptember.ts
 * Requires Application Default / Firebase admin credentials when writing.
 */

import { raiseAndStoreCustomerInvoice, publishInvoiceDeskNotice } from './issueInvoices'

const LEMON_FNB_MACHINE = 1

const SWIPES: Array<{
  deskCardId: number
  amountZar: number
  invoiceDate: string
  transactionTime: string
  cardMasked: string
  authCode: string
  rrn: string
  uti?: string
}> = [
  {
    deskCardId: 5,
    amountZar: 11_000,
    invoiceDate: '2026-09-01',
    transactionTime: '14:02:00',
    cardMasked: '441279******0922',
    authCode: '548406',
    rrn: '04Yfge031004',
  },
  {
    deskCardId: 4,
    amountZar: 10_000,
    invoiceDate: '2026-09-01',
    transactionTime: '13:15:53',
    cardMasked: '441279******0955',
    authCode: '504990',
    rrn: '04Yfge031003',
  },
  {
    deskCardId: 3,
    amountZar: 6_000,
    invoiceDate: '2026-09-01',
    transactionTime: '20:20:48',
    cardMasked: '428670******6696',
    authCode: '042403',
    rrn: '04Yfge032001',
  },
  {
    deskCardId: 5,
    amountZar: 4_000,
    invoiceDate: '2026-09-01',
    transactionTime: '20:34:31',
    cardMasked: '441279******0922',
    authCode: '893796',
    rrn: '04Yfge032002',
  },
  {
    deskCardId: 4,
    amountZar: 13_000,
    invoiceDate: '2026-09-03',
    transactionTime: '18:19:02',
    cardMasked: '441279******0955',
    authCode: '390073',
    rrn: '04Yfge033001',
    uti: '1f56b6ee-8247-4809-b9be-60148e22e5ce',
  },
  {
    deskCardId: 5,
    amountZar: 14_000,
    invoiceDate: '2026-09-03',
    transactionTime: '18:31:12',
    cardMasked: '441279******0922',
    authCode: '399721',
    rrn: '04Yfge033002',
    uti: '17bf89c9-6160-4511-a27a-815a91bfa67f',
  },
]

async function main() {
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
    // Local dry-run: print the planned invoices without writing.
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          count: SWIPES.length,
          totalZar: SWIPES.reduce((sum, row) => sum + row.amountZar, 0),
          rows: SWIPES.map((row) => ({
            buyerCard: row.deskCardId,
            amountZar: row.amountZar,
            date: row.invoiceDate,
            time: row.transactionTime,
            card: row.cardMasked,
          })),
        },
        null,
        2
      )
    )
    console.log('Set FIREBASE_CONFIG or run under Functions to write. Dry-run only.')
    return
  }
  const admin = await import('firebase-admin')
  if (!admin.apps.length) admin.initializeApp()
  const raised = []
  for (const swipe of SWIPES) {
    const invoice = await raiseAndStoreCustomerInvoice({
      machineId: LEMON_FNB_MACHINE,
      deskCardId: swipe.deskCardId,
      amountZar: swipe.amountZar,
      raisedTiming: 'raised_after_swipe',
      invoiceDate: swipe.invoiceDate,
      transactionTime: swipe.transactionTime,
      paymentTrace: {
        method: 'Card purchase — FNB merchant terminal',
        cardMasked: swipe.cardMasked,
        authCode: swipe.authCode,
        rrn: swipe.rrn,
        uti: swipe.uti || null,
      },
      notes: ['Back-filled September Lemon FNB swipe. Raised after swipe.'],
    })
    await publishInvoiceDeskNotice(invoice)
    raised.push(invoice.invoiceNumber)
  }
  console.log(JSON.stringify({ raised }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
