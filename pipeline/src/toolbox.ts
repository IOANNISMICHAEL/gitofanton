// Toolbox lists (PLAN v2 §5, M7): skills, MCP servers, agents & plugins, ranked by the growth of
// the GitHub repo behind each item, with package downloads where they exist.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CATEGORIES, VIEW_SIZE } from './config.ts'
import { score, type Scored } from './score.ts'
import type { ToolRead } from './tools.ts'
import { log } from './util.ts'

export const TOOLBOX_LISTS = ['skills', 'mcp', 'agents'] as const
export type ToolboxList = (typeof TOOLBOX_LISTS)[number]
const TYPES: Record<ToolboxList, ToolRead['type'][]> = { skills: ['skill'], mcp: ['mcp'], agents: ['agent', 'plugin'] }

export const MAX_PER_REPO = 3 // a repo with 300 skills shows at most 3 of them in a list
export const BULK_PUBLISHER = 50 // MCP namespaces publishing more servers than this need proof of use
export const BULK_MIN_STARS = 10
export const BULK_MIN_DOWNLOADS = 100

type Entry = { t: ToolRead; repo?: Scored; dl?: number }

export type ToolItem = {
  id: number
  ty: ToolRead['type']
  n: string // display name
  rp: string | null // owner/name of the GitHub repo behind it
  u: string | null // where to open it
  d: string | null
  c: string
  s: number // repo stars (0 when no tracked repo)
  g: number // repo stars gained in the window (All time: repo stars)
  fg: number
  dl: number | null // weekly package downloads
  a: string | null
  cr: string // first seen, YYYY-MM-DD
  p: string | null // last push of the repo
  pk?: string // package name
  rm?: 1 // MCP: hosted endpoint
  new?: 1
  f?: string
}

/** Every MCP namespace with its server count, for the bulk-publisher gate. */
export function publisherCounts(tools: ToolRead[]) {
  const m = new Map<string, number>()
  for (const t of tools) if (t.type === 'mcp' && t.status === 'active') m.set(t.name.split('/')[0], (m.get(t.name.split('/')[0]) ?? 0) + 1)
  return m
}

/** Quality gate: drops mass-produced MCP servers unless the repo or downloads show real use; hides blocked or hidden items. */
export function isListed(t: ToolRead, repo: Scored | undefined, downloads: number | undefined, publishers: Map<string, number>) {
  if (t.status !== 'active') return false
  if (repo && (repo.hidden || repo.isArchived || repo.isFork)) return false
  if (t.type !== 'mcp') return true
  if ((publishers.get(t.name.split('/')[0]) ?? 0) <= BULK_PUBLISHER) return true
  return (repo?.stars ?? 0) >= BULK_MIN_STARS || (downloads ?? 0) >= BULK_MIN_DOWNLOADS
}

export function link(t: ToolRead, repo: string | null) {
  if ((t.type === 'skill' || t.type === 'plugin') && repo && t.path) {
    const dir = t.path.replace(/\/?(SKILL\.md|\.claude-plugin\/plugin\.json)$/i, '')
    return `https://github.com/${repo}${dir ? `/tree/HEAD/${dir}` : ''}`
  }
  if (repo) return `https://github.com/${repo}`
  return t.repo_url ?? t.website
}

/**
 * Toolbox pages have no time tabs or category chips: the sort is the menu (owner, 2026-10-18), and each
 * sort is its own pre-ranked file, because a list holds up to 17k items and the browser only gets 500.
 *   trending:  this week's repo growth, size-adjusted (items without growth follow, by stars)
 *   stars, downloads, newest (first seen), updated (last push)
 */
export const TOOL_SORTS = ['trending', 'stars', 'downloads', 'newest', 'updated'] as const
export type ToolSort = (typeof TOOL_SORTS)[number]
export const sortsFor = (list: ToolboxList): ToolSort[] => TOOL_SORTS.filter((s) => s !== 'downloads' || list === 'mcp')

const CATEGORY_FILE_SIZE = 20 // category pages show the first few of each toolbox list

export function rankTools(items: Entry[], sort: ToolSort) {
  const g = (x: Entry) => x.repo?.gain.week ?? 0
  const s = (x: Entry) => x.repo?.stars ?? 0
  const dl = (x: Entry) => x.dl ?? -1
  const push = (x: Entry) => x.repo?.pushedAt ?? ''
  const cmp: Record<ToolSort, (a: Entry, b: Entry) => number> = {
    trending: (a, b) => score(g(b), s(b)) - score(g(a), s(a)) || s(b) - s(a) || dl(b) - dl(a),
    stars: (a, b) => s(b) - s(a) || dl(b) - dl(a),
    downloads: (a, b) => dl(b) - dl(a) || s(b) - s(a),
    newest: (a, b) => b.t.first_seen.localeCompare(a.t.first_seen) || s(b) - s(a),
    updated: (a, b) => push(b).localeCompare(push(a)) || s(b) - s(a),
  }
  const ranked = (sort === 'downloads' ? items.filter((x) => x.dl != null) : items).slice().sort(cmp[sort])
  const perRepo = new Map<number, number>()
  return ranked.filter((x) => {
    if (!x.t.repo_id) return true
    const n = (perRepo.get(x.t.repo_id) ?? 0) + 1
    perRepo.set(x.t.repo_id, n)
    return n <= MAX_PER_REPO
  })
}

export function writeToolbox(outDir: string, tools: ToolRead[], downloads: Map<number, number>, repos: Map<number, Scored>, now: Date) {
  const publishers = publisherCounts(tools)
  const counts: Record<string, number> = {}
  let files = 0
  const toItem = (x: Entry): ToolItem => {
    const r = x.repo
    const repoName = r?.fullName ?? null
    return {
      id: x.t.id,
      ty: x.t.type,
      n: x.t.title || x.t.name.split('/').pop() || x.t.name,
      rp: repoName,
      u: link(x.t, repoName),
      d: x.t.description,
      c: x.t.category,
      s: r?.stars ?? 0,
      g: r ? r.gain.week : 0,
      fg: r ? r.forks.week : 0,
      dl: x.dl ?? null,
      a: r?.avatarUrl ?? null,
      cr: x.t.first_seen.slice(0, 10),
      p: r?.pushedAt?.slice(0, 10) ?? null,
      ...(x.t.package ? { pk: x.t.package } : {}),
      ...(x.t.remote ? { rm: 1 as const } : {}),
      ...(now.getTime() - Date.parse(x.t.first_seen) <= 7 * 86_400_000 ? { new: 1 as const } : {}),
      ...(r?.flag ? { f: r.flag } : {}),
    }
  }
  const write = (rel: string, body: unknown) => {
    const p = join(outDir, 'data', 'toolbox', rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(body))
    files++
  }
  for (const list of TOOLBOX_LISTS) {
    const items: Entry[] = tools
      .filter((t) => TYPES[list].includes(t.type))
      .map((t) => ({ t, repo: t.repo_id ? repos.get(t.repo_id) : undefined, dl: downloads.get(t.id) }))
      .filter((x) => isListed(x.t, x.repo, x.dl, publishers) && !x.repo?.flag)
    counts[list] = items.length
    for (const sort of sortsFor(list)) {
      const ranked = rankTools(items, sort)
      counts[`${list}.${sort}`] = ranked.length
      write(`${list}/${sort}.json`, { list, sort, category: 'all', total: ranked.length, items: ranked.slice(0, VIEW_SIZE).map(toItem) })
      if (sort === 'trending') {
        for (const c of CATEGORIES) {
          const inCat = ranked.filter((x) => x.t.category === c)
          write(`${list}/category/${c}.json`, { list, sort, category: c, total: inCat.length, items: inCat.slice(0, CATEGORY_FILE_SIZE).map(toItem) })
        }
      }
    }
  }
  // Per-category counts (listed items of every type) for the front page's category cards.
  const byCategory: Record<string, number> = {}
  for (const t of tools) {
    if (t.status !== 'active') continue
    const repo = t.repo_id ? repos.get(t.repo_id) : undefined
    if (isListed(t, repo, downloads.get(t.id), publishers)) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1
  }
  write('meta.json', { counts, byCategory })
  log('toolbox', counts)
  return { files, counts }
}
