import { test } from 'node:test'
import assert from 'node:assert/strict'
import { githubRepo } from '../src/mcp-registry.ts'
import { weekOf } from '../src/downloads.ts'
import { contentHash } from '../src/tools.ts'
import { loadRules, makeCategoriser, stripFormatWords } from '../src/categorise.ts'

test('githubRepo extracts owner/name from repository URLs', () => {
  assert.equal(githubRepo('https://github.com/scope-bid/scope-mcp'), 'scope-bid/scope-mcp')
  assert.equal(githubRepo('https://github.com/a/b.git'), 'a/b')
  assert.equal(githubRepo('https://github.com/a/b/tree/main/servers/x'), 'a/b')
  assert.equal(githubRepo('https://gitlab.com/a/b'), null)
  assert.equal(githubRepo(undefined), null)
})

test('weekOf returns the Monday of the UTC week', () => {
  assert.equal(weekOf(new Date('2026-10-17T20:00:00Z')), '2026-10-12') // Saturday
  assert.equal(weekOf(new Date('2026-10-12T00:00:00Z')), '2026-10-12') // Monday
  assert.equal(weekOf(new Date('2026-10-18T23:59:00Z')), '2026-10-12') // Sunday
})

test('contentHash is stable and changes with content', () => {
  assert.equal(contentHash({ a: 1 }), contentHash({ a: 1 }))
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }))
})

test('toolbox items are categorised by job, not by being an MCP server', () => {
  const cat = makeCategoriser(loadRules())
  const tool = (text: string) => cat({ topics: [], description: stripFormatWords(text), language: null })
  assert.equal(tool('MCP server for PostgreSQL databases'), 'data')
  assert.equal(tool('Model Context Protocol server for Unity scenes'), 'gamedev')
  assert.equal(tool('MCP server for Linear issues and roadmaps'), 'product')
  assert.equal(tool('Kubernetes cluster management MCP'), 'devops')
  assert.equal(tool('An MCP server'), 'other')
})

import { isListed, rankTools, publisherCounts, MAX_PER_REPO } from '../src/toolbox.ts'
import { decide } from '../src/classify.ts'
import type { ToolRead } from '../src/tools.ts'
import type { Scored } from '../src/score.ts'

let tid = 1
const tool = (p: Partial<ToolRead>): ToolRead => ({
  id: tid++, type: 'mcp', slug: `mcp/x${tid}`, name: `io.github.pub/x${tid}`, title: null, description: null, repo_url: null,
  repo_id: null, path: null, package: null, package_registry: null, remote: 0, website: null, status: 'active',
  category: 'other', first_seen: '2026-10-01T00:00:00Z', changed_at: null, ...p,
})
const repo = (id: number, stars: number, week: number): Scored => ({
  id, fullName: `o/r${id}`, description: null, language: null, topics: [], avatarUrl: null, createdAt: '2020-01-01T00:00:00Z',
  pushedAt: null, category: 'other', stars, gain: { today: week, week, month: week, all: stars },
  forks: { today: 0, week: 0, month: 0, all: 0 }, activity7: 0, isFork: false, isArchived: false, hidden: false, flag: null,
})

test('bulk MCP publishers are listed only with real use', () => {
  const bulk = Array.from({ length: 60 }, () => tool({ name: `io.github.spam/x${tid}` }))
  const solo = tool({ name: 'com.acme/server' })
  const pubs = publisherCounts([...bulk, solo])
  assert.equal(isListed(solo, undefined, undefined, pubs), true)
  assert.equal(isListed(bulk[0], undefined, undefined, pubs), false)
  assert.equal(isListed(bulk[1], undefined, 150, pubs), true) // >= 100 weekly downloads
  assert.equal(isListed(bulk[2], repo(1, 25, 0), undefined, pubs), true) // repo >= 10 stars
  assert.equal(isListed(tool({ type: 'skill', status: 'removed' }), undefined, undefined, pubs), false)
})

test('rankTools: one ranking per sort, at most 3 items per repo', () => {
  const r = repo(7, 1000, 50)
  const many = Array.from({ length: 5 }, () => ({ t: tool({ type: 'skill', repo_id: 7 }), repo: r }))
  const other = { t: tool({ type: 'skill', repo_id: 8 }), repo: repo(8, 100, 20) }
  const idle = { t: tool({ type: 'skill' }), dl: 999 }
  const trending = rankTools([...many, other, idle], 'trending')
  assert.equal(trending.filter((x) => x.t.repo_id === 7).length, MAX_PER_REPO)
  assert.equal(trending[0].t.repo_id, 7) // momentum: 50 / log10(1100) = 16.4 beats 20 / log10(200) = 8.7
  assert.equal(trending.at(-1), idle) // no growth signal: still listed, last
  assert.equal(rankTools([other, idle], 'stars')[0], other)
  assert.deepEqual(rankTools([other, idle], 'downloads'), [idle]) // only items with a package
})

test('decide: confident best match or null', () => {
  const protos: [any, number[]][] = [['data', [1, 0]], ['ai', [0, 1]]]
  assert.equal(decide([0.9, 0.1], protos), 'data')
  assert.equal(decide([0.2, 0.19], protos), null) // too close / too weak
})

test('radar: one entry per repo, shown as its most specific tool type', async () => {
  const { radarEntries } = await import('../src/radar.ts')
  const plain = { ...repo(101, 5000, 40), category: 'ai' as const }
  const host = { ...repo(102, 9000, 80), category: 'ai' as const }
  const idle = { ...repo(103, 9000, 0), category: 'ai' as const }
  const tools = [
    tool({ type: 'skill', repo_id: 102, category: 'gamedev' }),
    tool({ type: 'agent', repo_id: 102, title: 'Helper', category: 'gamedev' }),
  ]
  const e = radarEntries([plain, host, idle], tools, new Map())
  assert.deepEqual(e.map((x) => [x.n, x.ty, x.q, x.c]), [['o/r101', 'repo', 0, 'ai'], ['Helper', 'agent', 3, 'gamedev']])
})

test('radar: 50 items, 20 per quadrant first, rings 5/10/15/20 by stars', async () => {
  const { buildRadar } = await import('../src/radar.ts')
  const mk = (i: number, q: number) => ({ n: `x${i}`, ty: 'repo' as const, q, c: 'ai', s: 1000 + i * 100, g: 10 + i, u: '', a: null })
  const r = buildRadar([...Array.from({ length: 40 }, (_, i) => mk(i, 0)), ...Array.from({ length: 40 }, (_, i) => mk(100 + i, 2))])
  assert.equal(r.items.length, 50) // 20 + 20 under the cap, then the next 10 best of any type
  assert.ok(r.items.filter((i) => i.q === 2).length >= 20)
  const big = buildRadar([0, 1, 2, 3].flatMap((q) => Array.from({ length: 20 }, (_, i) => mk(q * 100 + i, q))))
  assert.deepEqual([0, 1, 2, 3].map((ring) => big.items.filter((i) => i.ring === ring).length), [5, 10, 15, 20])
  assert.ok(big.items.filter((i) => i.ring === 0).every((i) => i.s >= big.rings[1].max))
})
