import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activityEventToItem, type ActivityEventDoc } from './activityEvents'

const base: ActivityEventDoc = {
  title: 'Step 2 · Invoice',
  createdAt: { toMillis: () => 1_000 },
  simulated: true,
  planRunId: 'plan-test',
  deskPlanChip: '24h plan',
}

describe('bank email activity parsing', () => {
  it('accepts a complete read-only round preview', () => {
    const item = activityEventToItem('round', {
      ...base,
      deskBankEmailRound: {
        roundId: 'round-1',
        due: true,
        horizonHours: 24,
        dayLabel: 'MON 26 OCT',
        expectedReplyLabel: 'TUE 27 OCT',
        nextRoundLabel: 'THU 29 OCT',
        notSelected: ['BIM', 'FNB Moz', 'Vista'],
        selected: [{
          bankKey: 'absa_mz',
          bank: 'Absa Moçambique',
          shortBank: 'Absa',
          banker: 'Ivan Nhaguilunguane',
          to: 'banker@example.com',
          reason: 'untested at this amount',
          testedAmountZar: 65_000,
          sendTimeLabel: '09:00',
          subject: 'Instruções de EFT',
          bodyPt: 'Junto enviamos a factura.',
          attachments: [{ ticketId: 'eft-1', filename: 'Factura_EFT_1_1.pdf', amountZar: 65_000 }],
        }],
      },
    })
    assert.equal(item.deskBankEmailRound?.selected[0]?.testedAmountZar, 65_000)
    assert.equal(item.simulated, true)
    assert.equal(item.deskPlanChip, '24h plan')
  })

  it('rejects incomplete reply evidence instead of coercing it', () => {
    const item = activityEventToItem('reply', {
      ...base,
      deskBankExpectedReplies: {
        roundId: 'round-1',
        roundLabel: 'MON 26 OCT',
        replies: {
          replyAtMs: 2_000,
          rows: [{ bank: 'Absa Moçambique', status: 'accepted' }],
        },
      },
    })
    assert.equal(item.deskBankExpectedReplies, undefined)
  })
})
