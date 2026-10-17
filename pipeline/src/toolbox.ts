// Toolbox lists (PLAN v2 §5, M7): skills, MCP servers, agents & plugins, ranked by the growth of
// the GitHub repo behind each item, with package downloads where they exist.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CATEGORIES, VIEW_SIZE } from './config.ts'
import { WINDOWS, score, type Scored, type Window } from './score.ts'
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

function link(t: ToolRead, repo: string | null) {
  if ((t.type === 'skill' || t.type === 'plugin') && repo && t.path) {
    const dir = t.path.replace(/\/?(SKILL\.md|\.claude-plugin\/plugin\.json)$/i, '')
    return `https://github.com/${repo}${dir ? `/tree/HEAD/${dir}` : ''}`
  }
  if (repo) return `https://github.com/${repo}`
  return t.repo_url ?? t.website
}

/** Rank one list in one window: growth momentum for time windows; stars, then downloads, for All time. */
export function rankTools(items: Entry[], w: Window) {
  const g = (x: { repo?: Scored }) => (x.repo ? x.repo.gain[w] : 0)
  const s = (x: { repo?: Scored }) => x.repo?.stars ?? 0
  const ranked =
    w === 'all'
      ? [...items].sort((a, b) => s(b) - s(a) || (b.dl ?? 0) - (a.dl ?? 0))
      : items.filter((x) => g(x) > 0).sort((a, b) => score(g(b), s(b)) - score(g(a), s(a)) || (b.dl ?? 0) - (a.dl ?? 0))
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
  for (const list of TOOLBOX_LISTS) {
    const items: Entry[] = tools
      .filter((t) => TYPES[list].includes(t.type))
      .map((t) => ({ t, repo: t.repo_id ? repos.get(t.repo_id) : undefined, dl: downloads.get(t.id) }))
      .filter((x) => isListed(x.t, x.repo, x.dl, publishers))
    counts[list] = items.length
    for (const w of WINDOWS) {
      const ranked = rankTools(items, w)
      counts[`${list}.${w}`] = ranked.length
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
          g: r ? r.gain[w] : 0,
          fg: r ? r.forks[w] : 0,
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
      const write = (cat: string, list2: typeof ranked) => {
        const p = join(outDir, 'data', 'toolbox', list, w, `${cat}.json`)
        mkdirSync(dirname(p), { recursive: true })
        const unflagged = list2.filter((x) => !x.repo?.flag)
        writeFileSync(p, JSON.stringify({ list, window: w, category: cat, lang: null, total: unflagged.length, items: unflagged.slice(0, VIEW_SIZE).map(toItem) }))
        files++
      }
      write('all', ranked)
      for (const c of CATEGORIES) write(c, ranked.filter((x) => x.t.category === c))
    }
  }
  log('toolbox', counts)
  return { files, counts }
}
