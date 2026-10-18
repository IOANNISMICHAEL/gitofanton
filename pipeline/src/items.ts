// Item pages (PLAN v2 §5, M8): one pre-rendered page for each of the top ITEM_PAGES items across types.
// The pipeline picks them, gives each a stable URL and writes their data to web/.item-data/pages.json
// (outside public/: only the site build reads it). Lists, radars and search link to these URLs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { d1 } from './cf.ts'
import type { RepoRow } from './repos.ts'
import { isEligible, score, type Scored } from './score.ts'
import { isListed, link, publisherCounts } from './toolbox.ts'
import type { ToolRead } from './tools.ts'
import { chunk, log } from './util.ts'

export const ITEM_PAGES = 10_000
/** Minimum share of the pages per type; unused shares fall to the best of the rest. */
export const PAGE_SHARES: [PageKind[], number][] = [
  [['mcp'], 0.2],
  [['skill'], 0.15],
  [['agent', 'plugin'], 0.1],
  [['repo'], 0.45],
]
export const HISTORY_DAYS = 90
const SIMILAR = 6

/** Item page URL ("/repo/owner/name/") by repo id or tool id; undefined when the item has no page. */
export type ItemPaths = { repo: (id: number) => string | undefined; tool: (id: number) => string | undefined }
export const href = (p: string | undefined) => (p ? `/${p}/` : undefined)

export type PageKind = 'repo' | 'skill' | 'mcp' | 'agent' | 'plugin'
/** A short reference to another item page. */
export type Ref = { p: string; n: string; k: PageKind; s: number; g: number }

export type PageData = {
  p: string // URL path without slashes at the ends, e.g. "repo/owner/name"
  k: PageKind
  n: string
  d: string | null
  c: string
  repo: string | null // owner/name behind it
  u: string // source link
  s: number // repo stars
  g: { today: number; week: number; month: number; all: number }
  f: number // total forks
  l: string | null
  lic: string | null
  home: string | null
  t: string[]
  a: string | null
  cr: string | null // repo created
  pu: string | null // last push
  seen: string | null // tools: first seen in its registry or index
  arch: 0 | 1
  flag: string | null
  dl: number | null
  pk: string | null
  reg: string | null
  rm: 0 | 1
  path: string | null // file inside the repo (skills, plugins)
  hist: [string, number][] // [day, stars gained] from daily_stats, oldest first
  same: Ref[] // other pages backed by the same repo
  similar: Ref[] // same category and kind, closest in momentum
}

/** One URL segment: lower-case, safe characters only, no leading dots. */
export const seg = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|-+$/g, '') || 'x'

const repoSegs = (fullName: string) => fullName.split('/').map(seg).join('/')

/** The page URL for a repo or tool, before de-duplication. */
export function basePath(kind: PageKind, name: string, repo: string | null): string {
  switch (kind) {
    case 'repo':
      return `repo/${repoSegs(name)}`
    case 'mcp':
      return `mcp/${name.split('/').map(seg).join('/')}`
    case 'agent':
      return repo ? `agent/${repoSegs(repo)}` : `agent/${seg(name)}`
    case 'skill':
    case 'plugin':
      return repo ? `${kind}/${repoSegs(repo)}/${seg(name)}` : `${kind}/${seg(name)}`
  }
}

type Cand = { kind: PageKind; id: number; repo?: Scored; row?: RepoRow; tool?: ToolRead; dl?: number; stars: number; mom: number; cat: string }

/** Top ITEM_PAGES by their better rank of total stars and 7-day momentum. */
export function selectPages(repos: Scored[], rows: Map<number, RepoRow>, tools: ToolRead[], downloads: Map<number, number>, size = ITEM_PAGES) {
  const byId = new Map(repos.map((r) => [r.id, r]))
  const publishers = publisherCounts(tools)
  const cands: Cand[] = []
  for (const r of repos) {
    if (!isEligible(r)) continue
    cands.push({ kind: 'repo', id: r.id, repo: r, row: rows.get(r.id), stars: r.stars, mom: score(r.gain.week, r.stars), cat: r.category })
  }
  for (const t of tools) {
    const repo = t.repo_id ? byId.get(t.repo_id) : undefined
    const dl = downloads.get(t.id)
    if (!isListed(t, repo, dl, publishers) || repo?.flag) continue
    const stars = Math.max(repo?.stars ?? 0, dl ?? 0)
    cands.push({ kind: t.type, id: t.id, repo, row: repo ? rows.get(repo.id) : undefined, tool: t, dl, stars, mom: repo ? score(repo.gain.week, repo.stars) : 0, cat: t.category })
  }
  const byStars = [...cands].sort((a, b) => b.stars - a.stars)
  const byMom = [...cands].sort((a, b) => b.mom - a.mom)
  const best = new Map<Cand, number>()
  byStars.forEach((c, i) => best.set(c, i))
  byMom.forEach((c, i) => best.set(c, Math.min(best.get(c)!, c.mom > 0 ? i : Infinity)))
  const order = (a: Cand, b: Cand) => best.get(a)! - best.get(b)! || b.stars - a.stars
  // Each type first gets its share (most MCP servers have no stars and would never rank against
  // repos), then any free slots go to the best of the rest.
  const chosen = new Set<Cand>()
  for (const [kinds, share] of PAGE_SHARES) {
    const quota = Math.round(size * share)
    for (const c of cands.filter((x) => kinds.includes(x.kind)).sort(order).slice(0, quota)) chosen.add(c)
  }
  for (const c of [...cands].sort(order)) {
    if (chosen.size >= size) break
    chosen.add(c)
  }
  const picked = [...chosen].sort(order).slice(0, size)

  // Stable, unique URLs: a clash (two skills with one name in a repo) gets -2, -3, …
  const used = new Set<string>()
  const repoPath = new Map<number, string>()
  const toolPath = new Map<number, string>()
  const withPath = picked.map((c) => {
    const name = c.tool ? c.tool.title || c.tool.name.split('/').pop() || c.tool.name : c.repo!.fullName
    const base = c.kind === 'mcp' ? basePath('mcp', c.tool!.name, null) : basePath(c.kind, c.kind === 'repo' ? c.repo!.fullName : name, c.repo?.fullName ?? null)
    let p = base
    for (let i = 2; used.has(p); i++) p = `${base}-${i}`
    used.add(p)
    if (c.kind === 'repo') repoPath.set(c.id, p)
    else toolPath.set(c.id, p)
    return { c, p, name }
  })
  return { picked: withPath, repoPath, toolPath }
}

/** Daily stars gained (daily_stats rows) for the given repos over the last HISTORY_DAYS. */
async function readHistory(repoIds: number[], since: string) {
  const hist = new Map<number, [string, number][]>()
  for (const ids of chunk(repoIds, 2000)) {
    const r = await d1<{ repo_id: number; day: string; stars: number }>(
      'SELECT repo_id, day, stars FROM daily_stats WHERE repo_id IN (SELECT value FROM json_each(?1)) AND day >= ?2 ORDER BY day',
      [JSON.stringify(ids), since],
    )
    for (const row of r.results) hist.set(row.repo_id, [...(hist.get(row.repo_id) ?? []), [row.day, row.stars]])
  }
  return hist
}

export async function writePages(siteDir: string, sel: ReturnType<typeof selectPages>, now: Date) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  const repoIds = [...new Set(sel.picked.map((x) => x.c.repo?.id).filter((x): x is number => !!x))]
  const hist = await readHistory(repoIds, since)

  const ref = (x: (typeof sel.picked)[number]): Ref => ({ p: x.p, n: x.name, k: x.c.kind, s: x.c.repo?.stars ?? 0, g: x.c.repo?.gain.week ?? 0 })
  const byRepo = new Map<number, (typeof sel.picked)[number][]>()
  for (const x of sel.picked) if (x.c.repo) byRepo.set(x.c.repo.id, [...(byRepo.get(x.c.repo.id) ?? []), x])
  const byGroup = new Map<string, (typeof sel.picked)[number][]>()
  for (const x of sel.picked) {
    const key = `${x.c.kind === 'plugin' ? 'agent' : x.c.kind}:${x.c.cat}`
    byGroup.set(key, [...(byGroup.get(key) ?? []), x])
  }
  const pos = new Map<(typeof sel.picked)[number], number>()
  for (const g of byGroup.values()) {
    g.sort((a, b) => b.c.mom - a.c.mom || b.c.stars - a.c.stars)
    g.forEach((y, i) => pos.set(y, i))
  }

  const pages: PageData[] = sel.picked.map((x) => {
    const { c } = x
    const r = c.repo
    const row = c.row
    const group = byGroup.get(`${c.kind === 'plugin' ? 'agent' : c.kind}:${c.cat}`)!
    const at = pos.get(x)!
    // Neighbours in momentum order: the closest items above and below this one (not from its own repo).
    const similar: Ref[] = []
    for (let d = 1; similar.length < SIMILAR && (at - d >= 0 || at + d < group.length); d++) {
      for (const y of [group[at - d], group[at + d]]) {
        if (y && similar.length < SIMILAR && (!r || y.c.repo?.id !== r.id)) similar.push(ref(y))
      }
    }
    const same = r ? (byRepo.get(r.id) ?? []).filter((y) => y !== x).slice(0, 12).map(ref) : []
    return {
      p: x.p,
      k: c.kind,
      n: x.name,
      d: c.tool?.description ?? r?.description ?? null,
      c: c.cat,
      repo: r?.fullName ?? null,
      u: (c.tool ? link(c.tool, r?.fullName ?? null) : null) ?? (r ? `https://github.com/${r.fullName}` : ''),
      s: r?.stars ?? 0,
      g: r ? { ...r.gain } : { today: 0, week: 0, month: 0, all: 0 },
      f: r?.forks.all ?? 0,
      l: r?.language ?? null,
      lic: row?.license ?? null,
      home: c.tool?.website ?? row?.homepage ?? null,
      t: r?.topics.slice(0, 12) ?? [],
      a: r?.avatarUrl ?? null,
      cr: r?.createdAt?.slice(0, 10) ?? null,
      pu: r?.pushedAt?.slice(0, 10) ?? null,
      seen: c.tool?.first_seen.slice(0, 10) ?? null,
      arch: r?.isArchived ? 1 : 0,
      flag: r?.flag ?? null,
      dl: c.dl ?? null,
      pk: c.tool?.package ?? null,
      reg: c.tool?.package_registry ?? null,
      rm: c.tool?.remote ? 1 : 0,
      path: c.tool?.path ?? null,
      hist: r ? (hist.get(r.id) ?? []) : [],
      same,
      similar,
    }
  })
  const dir = join(siteDir, '.item-data')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'pages.json'), JSON.stringify({ generatedAt: now.toISOString(), pages }))
  log('item pages', { pages: pages.length, byKind: Object.fromEntries(['repo', 'skill', 'mcp', 'agent', 'plugin'].map((k) => [k, pages.filter((p) => p.k === k).length])) })
  return pages.length
}
