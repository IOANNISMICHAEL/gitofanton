import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPLIT_ABOVE, TWO_LETTER_CAP, buildShards, words, type SearchRow } from '../src/search.ts'

test('words: split on separators and camelCase, lower-cased', () => {
  assert.deepEqual(words('debpalash/VoiceStudio').sort(), ['debpalash', 'studio', 'voice', 'voicestudio'])
  assert.deepEqual(words('mcp-server_x').sort(), ['mcp', 'server', 'x'])
})

test('shards: every word files the row once; big two-letter keys split by three letters', () => {
  const row = (n: string, s: number): SearchRow => [n, 'repo', s, 'ai', `https://github.com/${n}`, null]
  const many = Array.from({ length: SPLIT_ABOVE + 10 }, (_, i) => row(`o${i}/mcp-tool${i}`, 10_000 - i))
  const { files, split } = buildShards([row('acme/VoiceStudio', 20_000), ...many])
  assert.deepEqual(files.get('vo')!.map((r) => r[0]), ['acme/VoiceStudio'])
  assert.deepEqual(files.get('st')!.map((r) => r[0]), ['acme/VoiceStudio'])
  assert.ok(split.includes('mc'))
  assert.equal(files.get('mc')!.length, TWO_LETTER_CAP)
  assert.equal(files.get('mcp')!.length, SPLIT_ABOVE + 10)
  assert.equal(files.get('mcp')![0][0], 'o0/mcp-tool0') // rank order kept
  assert.equal(new Set(files.get('to')!).size, files.get('to')!.length) // no repeats
})
