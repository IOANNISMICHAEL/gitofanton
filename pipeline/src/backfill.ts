// History backfill (PLAN v2 M16): daily stars for the last BACKFILL_DAYS from GitHub's star dates, for
// the ~2,000 repos people see on the site, so week and month lists and growth charts fill in before
// our own daily history covers them. Spread over several discover runs to stay inside the free limits.
import { BACKFILL_DAYS, BACKFILL_MAX_PAGES_PER_REPO, BACKFILL_PAGES_PER_RUN, BACKFILL_REPOS, BACKFILL_WRITES_PER_RUN, DAILY_MIN_STARS } from './config.ts'
import { d1BulkWrite, kvGet, kvPut, writeBudgetLeft } from './cf.ts'
import { fetchStarDates } from './github.ts'
import { loadState } from './state.ts'
import { gunzipJson, gzipJson, log } from './util.ts'

const KV_KEY = 'backfill'
type Progress = { done: number[] }

const SITE = 'https://gitofanton.com/data/lists'
const LIST_FILES = ['trending/week/all', 'trending/month/all', 'rising/all', 'gems/all']

/** Repo ids in the order the site shows them: the main lists, then every category of Trending this week. */
async function visibleRepos(categories: string[]): Promise<number[]> {
  const files = [...LIST_FILES, ...categories.map((c) => `trending/week/${c}`)]
  const seen = new Set<number>()
  for (const f of files) {
    try {
      const res = await fetch(`${SITE}/${f}.json`, { headers: { 'user-agent': 'git-of-anton-pipeline' } })
      if (!res.ok) continue
      for (const it of ((await res.json()) as { items: { id: number }[] }).items) seen.add(it.id)
    } catch {
      /* a missing list just contributes nothing */
    }
  }
  return [...seen].slice(0, BACKFILL_REPOS)
}

/**
 * Stars per UTC day from star dates (newest first), for days fully covered: from `from` to `to`
 * inclusive, and never the oldest partly-read day when the page cap stopped the read early.
 */
export function starsPerDay(dates: string[], from: string, to: string, complete: boolean): [string, number][] {
  const days = new Map<string, number>()
  for (const d of dates) {
    const day = d.slice(0, 10)
    if (day >= from && day <= to) days.set(day, (days.get(day) ?? 0) + 1)
  }
  const oldest = dates.length ? dates.reduce((m, d) => (d < m ? d : m)).slice(0, 10) : null
  return [...days.entries()].filter(([day]) => complete || !oldest || day > oldest).sort((a, b) => a[0].localeCompare(b[0]))
}

export async function runBackfill(categories: string[], now: Date) {
  const buf = await kvGet(KV_KEY)
  const progress: Progress = buf ? gunzipJson<Progress>(buf) : { done: [] }
  const done = new Set(progress.done)
  const repos = (await visibleRepos(categories)).filter((id) => !done.has(id))
  const state = await loadState(now.toISOString().slice(0, 10))
  const to = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10) // yesterday: today is still moving
  const from = new Date(now.getTime() - BACKFILL_DAYS * 86_400_000).toISOString().slice(0, 10)
  let pages = 0
  let written = 0
  let finished = 0
  try {
    for (const id of repos) {
      const nodeId = state.repos[id]?.[0]
      if (!nodeId) {
        done.add(id) // not tracked (yet): nothing to attach history to
        continue
      }
      if (pages >= BACKFILL_PAGES_PER_RUN || written >= BACKFILL_WRITES_PER_RUN || writeBudgetLeft() < 2000) break
      const dates: string[] = []
      let cursor: string | null = null
      let complete = true
      for (let p = 0; ; p++) {
        if (p >= BACKFILL_MAX_PAGES_PER_REPO) {
          complete = false
          break
        }
        const page = await fetchStarDates(nodeId, cursor)
        pages++
        dates.push(...page.dates)
        if (!page.more || !page.dates.length || page.dates.some((d) => d.slice(0, 10) < from)) break
        cursor = page.cursor
      }
      const rows = starsPerDay(dates, from, to, complete)
        .filter(([, n]) => n >= DAILY_MIN_STARS)
        .map(([day, n]) => [id, day, n])
      // Days we already recorded ourselves win: INSERT OR IGNORE.
      await d1BulkWrite(
        `INSERT OR IGNORE INTO daily_stats (repo_id, day, stars, forks, pushes, issues)
         SELECT value->>0, value->>1, value->>2, 0, 0, 0 FROM json_each(?1)`,
        rows,
        1000,
        1,
      )
      written += rows.length
      done.add(id)
      finished++
    }
  } finally {
    await kvPut(KV_KEY, gzipJson({ done: [...done] } satisfies Progress))
    log('backfill', { visible: repos.length + done.size, finished, remaining: repos.length - finished, pages, rows: written })
    console.log(`::notice::Backfill: ${finished} repos this run, ${Math.max(0, repos.length - finished)} to go, ${pages} GitHub pages, ${written} daily rows`)
  }
}
