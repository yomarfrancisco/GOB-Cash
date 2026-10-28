import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('bank email simulation safety', () => {
  it('does not import or invoke outbound email helpers from the simulation model', () => {
    const planner = source('./bankEmailRound.ts')
    assert.doesNotMatch(planner, /resend|sendEmail|sendMail|emailProvider/i)
  })

  it('stamps planned Step 2 writes with all reversible simulation metadata', () => {
    const invoices = source('../settlement/issueInvoices.ts')
    assert.match(invoices, /simulated:\s*true/)
    assert.match(invoices, /planRunId/)
    assert.match(invoices, /deskPlanChip/)
  })

  it('stamps expected reply posts and keeps them explicitly synthetic', () => {
    const routing = source('../tx/adminConversionRouting.ts')
    const publisher = routing.slice(
      routing.indexOf('async function publishDueExpectedBankReplies'),
      routing.indexOf('/** Part 2 desk line')
    )
    assert.match(publisher, /simulated:\s*true/)
    assert.match(publisher, /planRunId/)
    assert.match(publisher, /deskPlanChip/)
    assert.match(publisher, /synthetic:\s*true/)
    assert.doesNotMatch(publisher, /knownLimitZar|routeEvidence|sendEmail|resend/i)
  })
})
