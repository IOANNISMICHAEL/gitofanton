// Static JSON written into web/public/data before the site build (PLAN v2 §5, A2).
// The site build renders page 1 of every view into HTML from these files, and the browser
// downloads a view's file to sort and paginate its top 500 without further requests.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CATEGORIES, FORMULA_VERSION, OUT_FILE_LIMIT, VIEW_SIZE } from './config.ts'
import { LISTS, LIST_WINDOWS, gainWindow, isEligible, isNew, rank, trending, type ListName, type Scored, type Window } from './score.ts'
import { log } from './util.ts'
import { href, type ItemPaths } from './items.ts'

export type Item = {
  id: number
  ty: 'repo'
  n: string // owner/name
  d: string | null // description
  l: string | null // language
  c: string // category
  t: string[] // topics (max 4)
  s: number // total stars
  g: number // stars gained in the view's window (All time: total stars)
  fg: number // forks gained in the view's window (All time: total forks)
  a: string | null // owner avatar
  cr: string // created, YYYY-MM-DD
  p: string | null // last push, YYYY-MM-DD
  new?: 1
  f?: string // flag reason
  ip?: string // item page URL, when the repo has one
}

export type View = { list: ListName; window: Window | null; category: string; lang: string | null; total: number; items: Item[] }

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

const toItem = (r: Scored, w: Window, now: Date, ip?: string): Item => ({
  id: r.id,
  ty: 'repo',
  n: r.fullName,
  d: r.description,
  l: r.language,
  c: r.category,
  t: r.topics.slice(0, 4),
  s: r.stars,
  g: r.gain[w],
  fg: r.forks[w],
  a: r.avatarUrl,
  cr: day(r.createdAt)!,
  p: day(r.pushedAt),
  ...(isNew(r, now) ? { new: 1 as const } : {}),
  ...(r.flag ? { f: r.flag } : {}),
  ...(ip ? { ip } : {}),
})

/** Language URL slug; must match web/lib/data.ts. */
export const slug = (s: string) => s.toLowerCase().replace(/\+/g, 'p').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const LANGUAGES = (
  JSON.parse(readFileSync(new URL('../../config/languages.json', import.meta.url), 'utf8')) as { languages: string[] }
).languages

export function writeAll(outDir: string, repos: Scored[], now: Date, meta: Record<string, unknown>, paths?: ItemPaths) {
  const ip = (id: number) => href(paths?.repo(id))
  const dataDir = join(outDir, 'data')
  rmSync(dataDir, { recursive: true, force: true })
  const generatedAt = now.toISOString()
  let files = 0
  const write = (rel: string, body: unknown) => {
    const p = join(dataDir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(body))
    files++
  }
  // No timestamp in view files: an unchanged view keeps the same bytes and isn't re-uploaded.
  const writeView = (rel: string, v: Omit<View, 'items' | 'total'>, ranked: Scored[]) => {
    const gw = gainWindow(v.list, v.window)
    write(rel, { ...v, total: ranked.length, items: ranked.slice(0, VIEW_SIZE).map((r) => toItem(r, gw, now, ip(r.id))) } satisfies View)
  }

  const counts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  for (const list of LISTS) {
    for (const w of LIST_WINDOWS[list]) {
      const ranked = rank(list, repos, w, now)
      const dir = w ? `lists/${list}/${w}` : `lists/${list}`
      counts[w ? `${list}.${w}` : list] = ranked.length
      writeView(`${dir}/all.json`, { list, window: w, category: 'all', lang: null }, ranked)
      for (const c of CATEGORIES) {
        const inCat = ranked.filter((r) => r.category === c)
        writeView(`${dir}/${c}.json`, { list, window: w, category: c, lang: null }, inCat)
      }
      if (list === 'trending' && w) {
        for (const lang of LANGUAGES) {
          writeView(`${dir}/lang/${slug(lang)}.json`, { list, window: w, category: 'all', lang: slug(lang) }, ranked.filter((r) => r.language === lang))
        }
      }
    }
  }

  for (const r of repos) if (isEligible(r)) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1

  // Flagged repos leave every list and radar; the site shows them only behind "Show flagged".
  const flagged = repos.filter((r) => r.flag && isEligible(r, true)).sort((a, b) => b.gain.week - a.gain.week)
  write('flagged.json', { total: flagged.length, items: flagged.slice(0, VIEW_SIZE).map((r) => toItem(r, 'week', now, ip(r.id))) })
  counts.flagged = flagged.length

  // Front page: total stars gained today, and the topics most common among this week's trending repos.
  const eligible = repos.filter((r) => isEligible(r))
  const starsToday = eligible.reduce((n, r) => n + r.gain.today, 0)
  const topicCounts = new Map<string, number>()
  for (const r of trending(repos, 'week').slice(0, 300)) for (const t of r.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
  const trendingTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t)
  write('meta.json', {
    generatedAt,
    starsToday,
    trendingTopics,
    formulaVersion: FORMULA_VERSION,
    counts,
    categoryCounts,
    languages: LANGUAGES.map((name) => ({ name, slug: slug(name) })),
    ...meta,
  })
  log('categories', categoryCounts)
  return { files, generatedAt }
}

export function countFiles(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    n += statSync(p).isDirectory() ? countFiles(p) : 1
  }
  return n
}

export function assertFileCount(outDir: string) {
  const n = countFiles(outDir)
  if (n > OUT_FILE_LIMIT) throw new Error(`File-count guard: ${n} files under ${outDir} exceeds ${OUT_FILE_LIMIT}`)
  return n
}
