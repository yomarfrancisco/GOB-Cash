import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOME_DESK_PATH, HOME_PATH, quarantineProfileHref } from './homeRoutes'

describe('quarantineProfileHref', () => {
  it('maps bare profile to home', () => {
    assert.equal(quarantineProfileHref('/profile'), HOME_PATH)
    assert.equal(quarantineProfileHref(null), HOME_PATH)
  })

  it('maps activity deep-links to the desk', () => {
    assert.equal(quarantineProfileHref('/profile?activity=1'), HOME_DESK_PATH)
  })

  it('keeps non-profile hrefs', () => {
    assert.equal(quarantineProfileHref('/?desk=1'), '/?desk=1')
  })
})
