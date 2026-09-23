import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESK_SYSTEM_PROMPT, replyStaysInsideFacts } from './deskPrompt'

describe('desk system prompt', () => {
  it('names the three agents and forbids invented figures', () => {
    assert.match(DESK_SYSTEM_PROMPT, /Sam is the relationship manager/)
    assert.match(DESK_SYSTEM_PROMPT, /Leo is the ZAR liquidity manager/)
    assert.match(DESK_SYSTEM_PROMPT, /Amina is the MZN liquidity manager/)
    assert.match(DESK_SYSTEM_PROMPT, /do not invent a rate/i)
    assert.match(DESK_SYSTEM_PROMPT, /do not choose a rail/i)
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
