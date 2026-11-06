import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CAPITEC_ACCOUNT_PDF_PASSWORDS, capitecPdfPasswordList } from './capitecPdfPasswords'

describe('capitecPdfPasswordList', () => {
  it('always includes BRICS AI and Econometrica account numbers', () => {
    const list = capitecPdfPasswordList('')
    assert.deepEqual(list, [...CAPITEC_ACCOUNT_PDF_PASSWORDS])
  })

  it('keeps secret values first and dedupes', () => {
    const list = capitecPdfPasswordList('1055571175,9999999999')
    assert.equal(list[0], '1055571175')
    assert.equal(list[1], '9999999999')
    assert.ok(list.includes('1055902139'))
    assert.equal(list.filter((pw) => pw === '1055571175').length, 1)
  })
})
