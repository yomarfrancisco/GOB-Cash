import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_SYSTEM_PROMPT, isCannedDeskAdvice, replyAddsNoNewMoney, replyStaysInsideFacts } from './deskPrompt'

describe('desk system prompt', () => {
  it('names the three agents and forbids invented figures', () => {
    assert.match(DESK_SYSTEM_PROMPT, /Sam is the relationship manager/)
    assert.match(DESK_SYSTEM_PROMPT, /Leo is the ZAR liquidity manager/)
    assert.match(DESK_SYSTEM_PROMPT, /Amina is the MZN liquidity manager/)
    assert.match(DESK_SYSTEM_PROMPT, /do not invent a rate/i)
    assert.match(DESK_SYSTEM_PROMPT, /do not choose a rail/i)
  })

  it('tells the desk how to behave like a colleague', () => {
    assert.match(DESK_SYSTEM_PROMPT, /Answer the actual question first/)
    assert.match(DESK_SYSTEM_PROMPT, /do not do it again/i)
    assert.match(DESK_SYSTEM_PROMPT, /Never on a greeting/)
    assert.match(DESK_SYSTEM_PROMPT, /SAST clock/)
  })

  it('treats the old classifier cards as canned', () => {
    assert.equal(isCannedDeskAdvice('Need a clearer Ask', 'I am not sure'), true)
    assert.equal(isCannedDeskAdvice('Here', "I'm Sam."), false)
  })

  it('allows a greeting that adds no new figures', () => {
    const facts = 'Day 3 of 14 is open. R82,516.96 of R111,038.15 still to convert.'
    assert.equal(replyAddsNoNewMoney("I'm here. I'm Sam, the relationship manager.", facts), true)
    assert.equal(replyAddsNoNewMoney('Residual is R82,516.96 of R111,038.15.', facts), true)
    assert.equal(replyAddsNoNewMoney('We still have R50,000 to convert.', facts), false)
  })

  it('keeps a reply only when it repeats the fact figures and adds none', () => {
    const fact = 'This window is finished. R0 of R100,000 left. I recommend R102,340.'
    assert.equal(
      replyStaysInsideFacts('Leo here. R0 of R100,000 is left, so I recommend R102,340 next.', fact),
      true
    )
    assert.equal(
      replyStaysInsideFacts('I recommend R110,000 next.', fact),
      false
    )
    assert.equal(
      replyStaysInsideFacts('The window is finished. Say yes to open it.', fact),
      false
    )
  })
})
