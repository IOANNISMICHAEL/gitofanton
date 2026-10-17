import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSnapshots } from '../src/snapshot.ts'
import type { Tracked, Windows } from '../src/state.ts'

const NOW = 500_000
const t = (stars: number, dayStart: number, lastHour?: number): Tracked => ['n', stars, 0, dayStart, 0, 0, 0, lastHour]
const noWindows: Windows = { asOf: null, historyDays: 0, sums: {} }

test('repos gaining today, this week, or active on GH Archive are checked every run', () => {
  const repos = { gainedToday: t(110, 100, NOW - 1), weekly: t(100, 100, NOW - 1), archive: t(100, 100, NOW - 1), quiet: t(100, 100, NOW - 1) }
  const windows: Windows = { asOf: null, historyDays: 6, sums: { weekly: [12, 12, 0, 0] } }
  const plan = planSnapshots(repos, windows, { archive: [1, 0, 0, 0] }, NOW)
  assert.deepEqual(plan.moving.sort(), ['archive', 'gainedToday', 'weekly'])
  assert.deepEqual(plan.quiet, []) // checked an hour ago: not due
  assert.equal(plan.quietTotal, 1)
})

test('quiet repos are spread over the day, oldest check first, never-checked before all', () => {
  const repos: Record<string, Tracked> = {}
  for (let i = 0; i < 10; i++) repos[`q${i}`] = t(100, 100, NOW - 21 - i)
  repos.never = t(100, 100)
  const plan = planSnapshots(repos, noWindows, {}, NOW)
  assert.equal(plan.quietTotal, 11)
  assert.equal(plan.quiet.length, 3) // ceil(11 / 5)
  assert.deepEqual(plan.quiet, ['never', 'q9', 'q8'])
})
