import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gems, isEligible, rank, rising, score, trending, type Scored } from '../src/score.ts'
import { slug } from '../src/write-json.ts'
import { compactStars } from '../src/radar.ts'
import { makeCategoriser, loadRules } from '../src/categorise.ts'

const now = new Date('2026-10-17T12:00:00Z')
let nextId = 1
function repo(p: Partial<Scored> & { stars: number; week?: number; forksWeek?: number; all?: number }): Scored {
  const { week = 0, forksWeek = 0, all = week, ...rest } = p
  return {
    id: nextId++, fullName: `o/r${nextId}`, description: null, language: 'TypeScript', topics: [], avatarUrl: null,
    createdAt: '2020-01-01T00:00:00Z', pushedAt: null, category: 'other',
    gain: { today: 0, week, month: week, all }, forks: { today: 0, week: forksWeek, month: forksWeek, all: 0 },
    activity7: 0, isFork: false, isArchived: false, hidden: false, flag: null, ...rest,
  }
}

test('score divides gain by log10(total + 100)', () => {
  assert.equal(score(100, 900), 100 / 3)
})

test('trending prefers smaller repos at equal gain and drops ineligible ones', () => {
  const big = repo({ stars: 100_000, week: 500 })
  const small = repo({ stars: 1_000, week: 500 })
  const tiny = repo({ stars: 49, week: 500 }) // below MIN_STARS_LISTED
  const fork = repo({ stars: 5_000, week: 900, isFork: true })
  const flagged = repo({ stars: 5_000, week: 900, flag: 'Burst' })
  assert.deepEqual(trending([big, small, tiny, fork, flagged], 'week').map((r) => r.id), [small.id, big.id])
  assert.equal(isEligible(flagged, true), true)
})

test('Trending All time ranks by stars gained since tracking began, size-adjusted', () => {
  const a = repo({ stars: 900, all: 300 })
  const b = repo({ stars: 50_000, all: 400 }) // 400 / log10(50,100) = 85 < 300 / log10(1,000) = 100
  assert.deepEqual(trending([a, b], 'all').map((r) => r.id), [a.id, b.id])
})

test('rising only includes repos created within 90 days', () => {
  const old = repo({ stars: 500, week: 300 })
  const young = repo({ stars: 500, week: 100, createdAt: '2026-09-01T00:00:00Z' })
  assert.deepEqual(rising([old, young], now).map((r) => r.id), [young.id])
})

test('gems need 50–2000 stars, >= 20 weekly gain and some engagement', () => {
  const ok = repo({ stars: 300, week: 60, forksWeek: 1 })
  const noEngagement = repo({ stars: 300, week: 60 })
  const tooBig = repo({ stars: 5000, week: 600, forksWeek: 3 })
  const better = repo({ stars: 100, week: 40, activity7: 2 })
  assert.deepEqual(gems([ok, noEngagement, tooBig, better]).map((r) => r.id), [better.id, ok.id])
})

test('helpers', () => {
  assert.equal(compactStars(123_456), '123k')
  assert.equal(compactStars(1_250_000), '1.3M')
  assert.equal(slug('C++'), 'cpp')
  assert.equal(slug('C#'), 'csharp')
  assert.equal(slug('Jupyter Notebook'), 'jupyter-notebook')
})

test('categoriser: job-based categories, topics before keywords before language', () => {
  const cat = makeCategoriser(loadRules())
  assert.equal(cat({ topics: ['llm'], description: 'A database', language: 'Go' }), 'ai')
  assert.equal(cat({ topics: ['unity'], description: 'MCP server for Unity', language: 'C#' }), 'gamedev') // the job wins over the format
  assert.equal(cat({ topics: [], description: 'A fast SQL query engine', language: 'Rust' }), 'data')
  assert.equal(cat({ topics: [], description: 'Build agentic workflows', language: null }), 'ai')
  assert.equal(cat({ topics: [], description: 'Kanban board for teams', language: 'TypeScript' }), 'product')
  assert.equal(cat({ topics: ['tailwindcss'], description: null, language: 'TypeScript' }), 'frontend')
  assert.equal(cat({ topics: [], description: 'Nothing matches here', language: 'Swift' }), 'productivity')
  assert.equal(cat({ topics: [], description: 'Nothing matches here', language: 'Python' }), 'other')
  assert.equal(cat({ topics: [], description: 'grail of things', language: null }), 'other') // 'rag' must not match inside words
  assert.equal(cat({ topics: [], description: 'For the community', language: null }), 'other') // 'unity' must not match inside words
})
