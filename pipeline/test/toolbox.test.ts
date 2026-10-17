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

test('rankTools: growth for time windows, at most 3 items per repo', () => {
  const r = repo(7, 1000, 50)
  const many = Array.from({ length: 5 }, () => ({ t: tool({ type: 'skill', repo_id: 7 }), repo: r }))
  const other = { t: tool({ type: 'skill', repo_id: 8 }), repo: repo(8, 100, 20) }
  const idle = { t: tool({ type: 'skill' }), dl: 999 }
  const week = rankTools([...many, other, idle], 'week')
  assert.equal(week.filter((x) => x.t.repo_id === 7).length, MAX_PER_REPO)
  assert.equal(week[0].t.repo_id, 7) // momentum: 50 / log10(1100) = 16.4 beats 20 / log10(200) = 8.7
  assert.ok(!week.includes(idle)) // no growth signal: not in time-window lists
  assert.equal(rankTools([idle, other], 'all')[0], other) // All time: stars first, then downloads
})

test('decide: confident best match or null', () => {
  const protos: [any, number[]][] = [['data', [1, 0]], ['ai', [0, 1]]]
  assert.equal(decide([0.9, 0.1], protos), 'data')
  assert.equal(decide([0.2, 0.19], protos), null) // too close / too weak
})
