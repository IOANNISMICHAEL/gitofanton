import { test } from 'node:test'
import assert from 'node:assert/strict'
import { starsPerDay } from '../src/backfill.ts'

test('starsPerDay: counts per UTC day inside the window; drops the partly read oldest day', () => {
  const dates = ['2026-10-18T23:00:00Z', '2026-10-18T01:00:00Z', '2026-10-17T12:00:00Z', '2026-10-16T09:00:00Z', '2026-09-01T00:00:00Z']
  assert.deepEqual(starsPerDay(dates, '2026-10-01', '2026-10-18', true), [['2026-10-16', 1], ['2026-10-17', 1], ['2026-10-18', 2]])
  // Page cap hit: 2026-10-16 may be missing stars, so only later days count.
  assert.deepEqual(starsPerDay(dates.slice(0, 4), '2026-10-01', '2026-10-18', false), [['2026-10-17', 1], ['2026-10-18', 2]])
})
