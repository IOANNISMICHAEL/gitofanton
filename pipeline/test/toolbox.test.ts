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
