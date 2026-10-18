// Radars (PLAN v2 §Radar, M9): one per category, quadrants = item type, rings = total-stars rank.
// Written to data/radar/{category}.json; the site draws them (web/components/radar).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CATEGORIES, QUADRANTS, RADAR_RINGS, RADAR_SIZE } from './config.ts'
import { isEligible, score, type Scored } from './score.ts'
import { isListed, link, publisherCounts } from './toolbox.ts'
import type { ToolRead } from './tools.ts'
import { log } from './util.ts'
import { href, type ItemPaths } from './items.ts'

/** No quadrant takes more than this while other types have items to show. */
export const QUADRANT_CAP = 20

export type RadarEntry = {
  n: string // display name
  ty: 'repo' | 'skill' | 'mcp' | 'agent' | 'plugin'
  q: number // quadrant: index into QUADRANTS
  c: string // category
  s: number // total stars of the repo
  g: number // stars gained this week
  u: string // link
  a: string | null
}
export type RadarItem = RadarEntry & { ring: number }

const QUADRANT_OF: Record<RadarEntry['ty'], number> = { repo: 0, skill: 1, mcp: 2, agent: 3, plugin: 3 }
// A repo that hosts tools is shown as its most specific tool type, once.
const TYPE_RANK: Record<ToolRead['type'], number> = { skill: 1, mcp: 2, plugin: 3, agent: 4 }

export function compactStars(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** One entry per growing repo: as a plain repo, or as the toolbox item(s) it hosts. */
export function radarEntries(repos: Scored[], tools: ToolRead[], downloads: Map<number, number>, paths?: ItemPaths): RadarEntry[] {
  const byId = new Map(repos.map((r) => [r.id, r]))
  const publishers = publisherCounts(tools)
  const hosted = new Map<number, ToolRead[]>()
  for (const t of tools) {
    if (!t.repo_id) continue
    const repo = byId.get(t.repo_id)
    if (!repo || !isListed(t, repo, downloads.get(t.id), publishers)) continue
    hosted.set(t.repo_id, [...(hosted.get(t.repo_id) ?? []), t])
  }
  const out: RadarEntry[] = []
  for (const r of repos) {
    if (!isEligible(r) || r.gain.week <= 0) continue
    const ts = hosted.get(r.id)
    if (!ts) {
      out.push({ n: r.fullName, ty: 'repo', q: 0, c: r.category, s: r.stars, g: r.gain.week, u: href(paths?.repo(r.id)) ?? `https://github.com/${r.fullName}`, a: r.avatarUrl })
      continue
    }
    const best = ts.reduce((a, b) => (TYPE_RANK[b.type] > TYPE_RANK[a.type] ? b : a))
    const ofBest = ts.filter((t) => t.type === best.type)
    const one = ofBest.length === 1
    // Category: the most common one among the repo's tools of that type.
    const cats = new Map<string, number>()
    for (const t of ofBest) cats.set(t.category, (cats.get(t.category) ?? 0) + 1)
    const c = [...cats.entries()].sort((a, b) => b[1] - a[1])[0][0]
    out.push({
      n: one ? best.title || best.name.split('/').pop() || best.name : r.fullName,
      ty: best.type,
      q: QUADRANT_OF[best.type],
      c,
      s: r.stars,
      g: r.gain.week,
      u: (one ? (href(paths?.tool(best.id)) ?? link(best, r.fullName)) : href(paths?.repo(r.id))) ?? `https://github.com/${r.fullName}`,
      a: r.avatarUrl,
    })
  }
  return out
}

/** Top RADAR_SIZE by 7-day momentum (QUADRANT_CAP per quadrant first, then any), ringed by total-stars rank. */
export function buildRadar(entries: RadarEntry[]) {
  const perQ = [0, 0, 0, 0]
  const ranked = [...entries].sort((a, b) => score(b.g, b.s) - score(a.g, a.s))
  const picked: RadarEntry[] = []
  for (const e of ranked) {
    if (picked.length >= RADAR_SIZE) break
    if (perQ[e.q] >= QUADRANT_CAP) continue
    perQ[e.q]++
    picked.push(e)
  }
  // Types with too few growing items leave room: fill it with the next best of any type.
  for (const e of ranked) {
    if (picked.length >= RADAR_SIZE) break
    if (!picked.includes(e)) picked.push(e)
  }
  picked.sort((a, b) => b.s - a.s)
  const rings: { label: string; min: number; max: number }[] = []
  const items: RadarItem[] = []
  let start = 0
  RADAR_RINGS.forEach((size, ring) => {
    const members = picked.slice(start, start + size)
    start += size
    if (!members.length) return
    const max = members[0].s
    const min = members[members.length - 1].s
    rings.push({ label: min === max ? compactStars(max) : `${compactStars(min)}–${compactStars(max)}`, min, max })
    for (const m of members) items.push({ ...m, ring })
  })
  return { quadrants: QUADRANTS, rings, items }
}

export function writeRadars(outDir: string, repos: Scored[], tools: ToolRead[], downloads: Map<number, number>, paths?: ItemPaths) {
  const entries = radarEntries(repos, tools, downloads, paths)
  const sizes: Record<string, number> = {}
  for (const c of CATEGORIES) {
    if (c === 'other') continue
    const radar = buildRadar(entries.filter((e) => e.c === c))
    const p = join(outDir, 'data', 'radar', `${c}.json`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify({ category: c, ...radar }))
    sizes[c] = radar.items.length
  }
  log('radars', sizes)
  return sizes
}
