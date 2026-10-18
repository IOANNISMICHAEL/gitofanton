import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMainPage, toSubmit } from '../src/indexnow.ts'

const U = (p: string) => `https://gitofanton.com${p}`

test('IndexNow: everything at first, then new pages, main pages once a day', () => {
  const all = [U('/'), U('/trending/'), U('/repo/a/b/'), U('/repo/c/d/')]
  assert.equal(isMainPage(U('/trending/')), true)
  assert.equal(isMainPage(U('/repo/a/b/')), false)
  assert.deepEqual(toSubmit(all, null, '2026-10-18'), all)
  const sent = { day: '2026-10-18', sent: [U('/'), U('/trending/'), U('/repo/a/b/')] }
  assert.deepEqual(toSubmit(all, sent, '2026-10-18'), [U('/repo/c/d/')])
  assert.deepEqual(toSubmit(all, sent, '2026-10-19').sort(), [U('/'), U('/repo/c/d/'), U('/trending/')].sort())
})
