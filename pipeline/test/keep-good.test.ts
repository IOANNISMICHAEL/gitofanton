import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { failure, keepGood, notice } from '../src/keep-good.ts'

const list = (total: number) => ({ total, items: Array.from({ length: Math.min(total, 3) }, (_, i) => ({ id: i })) })
const put = (dir: string, rel: string, body: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(body))
}

test('failure: empty, collapsed or missing lists fail; normal swings pass', () => {
  assert.equal(failure(list(100), list(0)), 'empty (was 100)')
  assert.equal(failure(list(100), list(20)), 'dropped from 100 to 20')
  assert.equal(failure(list(100), null), 'missing')
  assert.equal(failure(list(100), list(60)), null)
  assert.equal(failure(list(10), list(1)), null) // too small for the collapse rule
  assert.equal(failure(list(0), list(0)), null) // never had items
})

test('keepGood: restores failed files, keeps good ones, ignores removed lists', () => {
  const good = mkdtempSync(join(tmpdir(), 'good-'))
  const fresh = mkdtempSync(join(tmpdir(), 'new-'))
  put(good, 'lists/trending/today/all.json', list(1600))
  put(fresh, 'lists/trending/today/all.json', list(0))
  put(good, 'lists/trending/week/all.json', list(2500))
  put(fresh, 'lists/trending/week/all.json', list(2400))
  put(good, 'lists/top/all/all.json', list(2500)) // list removed in code: its folder is gone
  put(good, 'meta.json', { generatedAt: 'old' })
  put(fresh, 'meta.json', { generatedAt: 'new' })
  const restored = keepGood(fresh, good)
  assert.deepEqual(restored.map((r) => r.file), ['lists/trending/today/all.json'])
  assert.equal(JSON.parse(readFileSync(join(fresh, 'lists/trending/today/all.json'), 'utf8')).total, 1600)
  assert.equal(JSON.parse(readFileSync(join(fresh, 'meta.json'), 'utf8')).generatedAt, 'new')
  assert.match(notice(restored, 'https://x/run'), /lists\/trending\/today.*all: empty \(was 1600\)/)
})
