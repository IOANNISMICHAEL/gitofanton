// Static JSON written into web/public/data before the site build (PLAN v2 §5, A2).
// The site build renders page 1 of every view into HTML from these files, and the browser
// downloads a view's file to sort and paginate its top 500 without further requests.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CATEGORIES, FORMULA_VERSION, OUT_FILE_LIMIT, QUADRANTS, RADAR_RINGS, RADAR_SIZE, VIEW_SIZE } from './config.ts'
import { LISTS, WINDOWS, isEligible, isNew, rank, trending, type ListName, type Scored, type Window } from './score.ts'
import { log } from './util.ts'

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
}

export type View = { list: ListName; window: Window; category: string; lang: string | null; total: number; items: Item[] }

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

const toItem = (r: Scored, w: Window, now: Date): Item => ({
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
})

/** Language URL slug; must match web/lib/data.ts. */
export const slug = (s: string) => s.toLowerCase().replace(/\+/g, 'p').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function compactStars(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export type RadarItem = { n: string; s: number; g: number; c: string; q: number; ring: number; a: string | null }

/** Top RADAR_SIZE by 7-day momentum, positioned by total-stars rank within that set (PLAN v2 §1). */
export function buildRadar(byWeek: Scored[]) {
  const set = byWeek.slice(0, RADAR_SIZE).sort((a, b) => b.stars - a.stars)
  const rings: { label: string; min: number; max: number }[] = []
  const items: RadarItem[] = []
  let start = 0
  RADAR_RINGS.forEach((size, ring) => {
    const members = set.slice(start, start + size)
    start += size
    if (!members.length) return
    const max = members[0].stars
    const min = members[members.length - 1].stars
    rings.push({ label: min === max ? compactStars(max) : `${compactStars(min)}–${compactStars(max)}`, min, max })
    // Quadrant = item type; every item is a repo until the Toolbox lands (M5–M7).
    for (const r of members) items.push({ n: r.fullName, s: r.stars, g: r.gain.week, c: r.category, q: 0, ring, a: r.avatarUrl })
  })
  return { quadrants: QUADRANTS, rings, items }
}

const LANGUAGES = (
  JSON.parse(readFileSync(new URL('../../config/languages.json', import.meta.url), 'utf8')) as { languages: string[] }
).languages

export function writeAll(outDir: string, repos: Scored[], now: Date, meta: Record<string, unknown>) {
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
    write(rel, { ...v, total: ranked.length, items: ranked.slice(0, VIEW_SIZE).map((r) => toItem(r, v.window, now)) } satisfies View)
  }

  const counts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  for (const list of LISTS) {
    for (const w of WINDOWS) {
      const ranked = rank(list, repos, w, now)
      counts[`${list}.${w}`] = ranked.length
      writeView(`lists/${list}/${w}/all.json`, { list, window: w, category: 'all', lang: null }, ranked)
      for (const c of CATEGORIES) {
        const inCat = ranked.filter((r) => r.category === c)
        if (list === 'top' && w === 'all') categoryCounts[c] = inCat.length
        writeView(`lists/${list}/${w}/${c}.json`, { list, window: w, category: c, lang: null }, inCat)
      }
      if (list === 'trending') {
        for (const lang of LANGUAGES) {
          writeView(`lists/trending/${w}/lang/${slug(lang)}.json`, { list, window: w, category: 'all', lang: slug(lang) }, ranked.filter((r) => r.language === lang))
        }
      }
    }
  }

  // Flagged repos leave every list and radar; the site shows them only behind "Show flagged".
  const flagged = repos.filter((r) => r.flag && isEligible(r, true)).sort((a, b) => b.gain.week - a.gain.week)
  write('flagged.json', { total: flagged.length, items: flagged.slice(0, VIEW_SIZE).map((r) => toItem(r, 'week', now)) })
  counts.flagged = flagged.length

  const radar = buildRadar(trending(repos, 'week'))
  write('radar.json', { generatedAt, ...radar })
  write('meta.json', {
    generatedAt,
    formulaVersion: FORMULA_VERSION,
    counts,
    categoryCounts,
    languages: LANGUAGES.map((name) => ({ name, slug: slug(name) })),
    ...meta,
  })
  log('radar', { items: radar.items.map((i) => `${i.n} [${i.c}] ring${i.ring}`) })
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
