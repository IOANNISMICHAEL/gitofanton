import { test } from 'node:test'
import assert from 'node:assert/strict'
import { busiestHour, coordinated, judge, loadBlocklist, makeBlocker, pickCandidates, youngIds, type Stargazer } from '../src/trust.ts'
import type { Scored } from '../src/score.ts'

const now = new Date('2026-10-17T20:00:00Z')
const at = (h: number, m = 0) => `2026-10-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
let uid = 1
const fan = (starredAt: string, p: Partial<Stargazer> = {}): Stargazer => ({ id: uid++, starredAt, createdAt: '2019-01-01T00:00:00Z', repos: 12, followers: 5, ...p })
const freshFan = (starredAt: string) => fan(starredAt, { createdAt: '2026-10-10T00:00:00Z', repos: 0, followers: 0 })

function repo(p: Partial<Scored> & { today?: number; week?: number; forksWeek?: number }): Scored {
  const { today = 0, week = 0, forksWeek = 0, ...rest } = p
  return {
    id: uid++, fullName: `o${uid}/r`, description: null, language: null, topics: [], avatarUrl: null,
    createdAt: '2026-10-01T00:00:00Z', pushedAt: '2026-10-17T00:00:00Z', category: 'other', stars: 1000,
    gain: { today, week, month: week, all: 1000 }, forks: { today: 0, week: forksWeek, month: forksWeek, all: 0 },
    activity7: 0, isFork: false, isArchived: false, hidden: false, flag: null, ...rest,
  }
}

test('busiestHour counts stars inside the densest 60-minute window', () => {
  const t = (h: number, m: number) => Date.parse(at(h, m))
  assert.equal(busiestHour([t(1, 0), t(1, 30), t(1, 59), t(3, 0)]), 3)
  assert.equal(busiestHour([]), 0)
})

test('new-account stargazers flag a repo on their own', () => {
  const sample = [...Array.from({ length: 60 }, () => freshFan(at(10))), ...Array.from({ length: 40 }, () => fan(at(11)))]
  const v = judge(repo({ today: 100, week: 300 }), sample, now)
  assert.match(v.reason ?? '', /^New accounts: 60%/)
})

test('a burst alone is not a flag (Hacker News front page); burst + no engagement is', () => {
  // 300 stars today, 250 of them between 14:00 and 14:59.
  const sample = [...Array.from({ length: 250 }, (_, i) => fan(at(14, i % 60))), ...Array.from({ length: 50 }, (_, i) => fan(at(3 + (i % 10))))]
  const hn = judge(repo({ today: 300, week: 600, forksWeek: 40 }), sample, now)
  assert.equal(hn.reason, null)
  assert.match(hn.signals[0], /^Burst: 83%/)
  const bought = judge(repo({ today: 300, week: 1200, forksWeek: 2, pushedAt: '2026-09-01T00:00:00Z' }), sample, now)
  assert.match(bought.reason ?? '', /^Burst: 83% .*; No engagement: 600 stars per fork/)
  const small = judge(repo({ today: 150, week: 1200, forksWeek: 2, pushedAt: '2026-09-01T00:00:00Z' }), sample, now)
  assert.equal(small.reason, null) // below the 200-a-day burst threshold
})

test('coordinated: young accounts shared across different owners, not same-owner fans', () => {
  const shared = Array.from({ length: 20 }, () => freshFan(at(9)))
  const ids = youngIds(shared)
  const records = {
    '1': { h: 0, f: null, s: [...ids, 900, 901] },
    '2': { h: 0, f: null, s: [...ids, 902] },
    '3': { h: 0, f: null, s: [...ids] },
  }
  const names = new Map([['1', 'alice/dsh-a'], ['2', 'bob/dsh-b'], ['3', 'alice/other']])
  const out = coordinated(records, names)
  assert.match(out.get('1') ?? '', /^Coordinated: 20 new accounts/)
  assert.ok(out.has('2'))
  // 1 and 3 share an owner and are skipped as a pair; 3 is still flagged through its overlap with bob's repo.
  assert.match(out.get('3') ?? '', /bob\/dsh-b/)
  assert.equal(youngIds([fan(at(9))]).length, 0)
})

test('candidates: bursts and the top of visible lists first, fresh verdicts skipped', () => {
  const a = repo({ today: 500 })
  const b = repo({ week: 10 })
  const c = repo({ week: 5 })
  const out = pickCandidates([[b, c]], [a, b, c], { [c.id]: { h: 99, f: null, s: [] } }, 100)
  assert.deepEqual(out.map((r) => r.id), [a.id, b.id])
})

test('blocklist matches whole words in names and descriptions', () => {
  const blocked = makeBlocker(loadBlocklist())
  assert.equal(blocked({ fullName: 'BreezeSolicitorMap/undress.ai', description: null }), true)
  assert.equal(blocked({ fullName: 'massgravel/Microsoft-Activation-Scripts', description: 'Open-source Windows and Office activator' }), true)
  assert.equal(blocked({ fullName: 'detailyang/awesome-cheatsheet', description: 'A cheat sheet collection' }), false)
  assert.equal(blocked({ fullName: 'notAI-tech/NudeNet', description: 'Lightweight nudity detection' }), false)
  assert.equal(blocked({ fullName: 'o/porntool', description: null }), false) // substring, not a word
})
