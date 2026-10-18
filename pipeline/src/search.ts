// ⌘K search index (PLAN v2 M11): the top SEARCH_SIZE names across every type, sharded by the first
// letters of each word in the name, so the browser downloads one small shard per search.
//   data/search/{xy}.json or {xyz}.json = [[name, type, stars, category, url, repo|null], ...] by rank
//   data/search/index.json = { names, split }: two-letter keys whose words are sharded by three letters
// The site matches the query's first word as a word prefix, and any further words anywhere in the name.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isEligible, type Scored } from './score.ts'
import { isListed, link, publisherCounts } from './toolbox.ts'
import type { ToolRead } from './tools.ts'
import { log } from './util.ts'

export const SEARCH_SIZE = 50_000

export type SearchRow = [name: string, type: string, stars: number, category: string, url: string, repo: string | null]

/** Lower-case words of a name: "debpalash/VoiceStudio" → debpalash, voice, studio, voicestudio. */
export function words(name: string): string[] {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const out = new Set<string>()
  for (const p of parts) {
    out.add(p.toLowerCase())
    for (const w of p.split(/(?<=[a-z0-9])(?=[A-Z])/)) out.add(w.toLowerCase())
  }
  return [...out]
}

export function searchRows(repos: Scored[], tools: ToolRead[], downloads: Map<number, number>): SearchRow[] {
  const byId = new Map(repos.map((r) => [r.id, r]))
  const publishers = publisherCounts(tools)
  const rows: { row: SearchRow; rank: number }[] = []
  for (const r of repos) {
    if (!isEligible(r)) continue
    rows.push({ row: [r.fullName, 'repo', r.stars, r.category, `https://github.com/${r.fullName}`, null], rank: r.stars })
  }
  for (const t of tools) {
    const repo = t.repo_id ? byId.get(t.repo_id) : undefined
    const dl = downloads.get(t.id)
    if (!isListed(t, repo, dl, publishers) || repo?.flag) continue
    const url = link(t, repo?.fullName ?? null)
    if (!url) continue
    const name = t.title || t.name.split('/').pop() || t.name
    // Tools without a repo rank by downloads (a weekly download counts like a star).
    rows.push({ row: [name, t.type, repo?.stars ?? 0, t.category, url, repo?.fullName ?? null], rank: Math.max(repo?.stars ?? 0, dl ?? 0) })
  }
  return rows
    .sort((a, b) => b.rank - a.rank)
    .slice(0, SEARCH_SIZE)
    .map((x) => x.row)
}

/** A two-letter shard bigger than this is split by three letters (its two-letter file keeps the top TWO_LETTER_CAP). */
export const SPLIT_ABOVE = 1500
export const TWO_LETTER_CAP = 1000
export const SHARD_CAP = 4000

/** Shards as files: { "mc.json": rows, "mcp.json": rows, ... } plus the list of split two-letter keys. */
export function buildShards(rows: SearchRow[]) {
  const by2 = new Map<string, SearchRow[]>()
  const by3 = new Map<string, SearchRow[]>()
  const add = (m: Map<string, SearchRow[]>, k: string, row: SearchRow) => {
    const list = m.get(k)
    if (!list) m.set(k, [row])
    else if (list[list.length - 1] !== row) list.push(row) // rows arrive in rank order; skip repeats
  }
  for (const row of rows) {
    // Filed under each word of the name and, for tools, of the repo name too.
    const ws = [...new Set([...words(row[0]), ...(row[5] ? words(row[5]) : [])])].sort()
    for (const w of ws) {
      if (w.length < 2) continue
      add(by2, w.slice(0, 2), row)
      if (w.length >= 3) add(by3, w.slice(0, 3), row)
    }
  }
  const files = new Map<string, SearchRow[]>()
  const split: string[] = []
  for (const [k2, list] of by2) {
    if (list.length <= SPLIT_ABOVE) {
      files.set(k2, list)
      continue
    }
    split.push(k2)
    files.set(k2, list.slice(0, TWO_LETTER_CAP))
    for (const [k3, l3] of by3) if (k3.startsWith(k2)) files.set(k3, l3.slice(0, SHARD_CAP))
  }
  return { files, split: split.sort() }
}

export function writeSearch(outDir: string, repos: Scored[], tools: ToolRead[], downloads: Map<number, number>) {
  const rows = searchRows(repos, tools, downloads)
  const { files, split } = buildShards(rows)
  const dir = join(outDir, 'data', 'search')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [k, list] of files) writeFileSync(join(dir, `${k}.json`), JSON.stringify(list))
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ names: rows.length, split }))
  log('search', { names: rows.length, files: files.size, split: split.length, largest: Math.max(...[...files.values()].map((l) => l.length)) })
  return { names: rows.length, files: files.size }
}
