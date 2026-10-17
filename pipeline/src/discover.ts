// Finding repos to track: GitHub search seeds (established + newly created repos) and GH Archive activity.
import { DISCOVER_CAP, GITHUB_CONCURRENCY, NEW_REPO_MIN_STARS, RISING_MAX_AGE_DAYS, SEARCH_PAGES_PER_RUN, SEED_MIN_STARS, TRACK_MIN_STARS } from './config.ts'
import { fetchMetaByNames, searchCount, searchPage, type RepoMeta } from './github.ts'
import type { Activity } from './ingest-gharchive.ts'
import type { SeedTask, State } from './state.ts'
import { addDays, chunk, log, mapLimit } from './util.ts'

const BASE = 'fork:false archived:false'
const SEARCH_CAP = 1000 // GitHub search returns at most 1,000 results per query

/** Split a star range until each slice has <= 1,000 results. */
async function sliceByStars(lo: number, hi: number | null, extra: string, out: string[]) {
  const range = hi === null ? `>=${lo}` : `${lo}..${hi}`
  const q = `stars:${range} ${extra} ${BASE}`.trim()
  const n = await searchCount(q)
  if (n <= SEARCH_CAP || (hi !== null && hi - lo < 1)) {
    if (n > 0) out.push(q)
    return
  }
  // Open-ended top range: split at a high bound first.
  const top = hi ?? Math.max(lo * 4, 50_000)
  if (hi === null) {
    await sliceByStars(top + 1, null, extra, out)
    await sliceByStars(lo, top, extra, out)
    return
  }
  const mid = Math.floor((lo + hi) / 2)
  await sliceByStars(lo, mid, extra, out)
  await sliceByStars(mid + 1, hi, extra, out)
}

/** Split a created-date range until each slice has <= 1,000 results. */
async function sliceByCreated(from: string, to: string, out: string[]) {
  const q = `created:${from}..${to} stars:>=${NEW_REPO_MIN_STARS} ${BASE}`
  const n = await searchCount(q)
  if (n <= SEARCH_CAP || from === to) {
    if (n > SEARCH_CAP) log('discover: slice still over 1,000, keeping the first 1,000', { q, n })
    if (n > 0) out.push(q)
    return
  }
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
  const mid = addDays(from, Math.floor(span / 2))
  await sliceByCreated(from, mid, out)
  await sliceByCreated(addDays(mid, 1), to, out)
}

/** Build the one-off seed queue: all repos >= SEED_MIN_STARS and all recent repos >= NEW_REPO_MIN_STARS. */
async function buildSeedQueue(today: string): Promise<SeedTask[]> {
  const qs: string[] = []
  await sliceByStars(SEED_MIN_STARS, null, '', qs)
  await sliceByCreated(addDays(today, -RISING_MAX_AGE_DAYS), today, qs)
  log('discover: seed queue built', { queries: qs.length })
  return qs.map((q) => ({ q, after: null }))
}

/** Run up to SEARCH_PAGES_PER_RUN search pages from the queue; returns repos found. */
export async function runSearchSeeds(state: State, today: string): Promise<RepoMeta[]> {
  if (!state.seed.built) {
    state.seed.queue = await buildSeedQueue(today)
    state.seed.built = true
  }
  // Every day, also sweep repos created in the last 2 days so new breakouts are tracked quickly.
  if (state.seed.recentDay !== today) {
    state.seed.queue.unshift({ q: `created:>=${addDays(today, -2)} stars:>=${NEW_REPO_MIN_STARS} ${BASE}`, after: null })
    state.seed.recentDay = today
  }
  const found: RepoMeta[] = []
  let pages = 0
  while (state.seed.queue.length && pages < SEARCH_PAGES_PER_RUN) {
    const task = state.seed.queue[0]
    const { repos, next } = await searchPage(task.q, task.after)
    pages++
    found.push(...repos)
    if (next && repos.length) task.after = next
    else state.seed.queue.shift()
  }
  log('discover: search', { pages, found: found.length, queueLeft: state.seed.queue.length })
  return found
}

/** Look up untracked repos seen in GH Archive, most-starred first; returns those worth tracking. */
export async function runArchiveDiscovery(state: State, activity: Activity, names: Map<number, string>, epochDay: number): Promise<RepoMeta[]> {
  const candidates = Object.entries(activity)
    .filter(([id]) => !state.repos[id] && !(state.rejected[id] && epochDay - state.rejected[id] < 7) && names.has(Number(id)))
    // Stars and forks are the strongest hints; pure push activity is mostly personal repos.
    .filter(([, a]) => a[0] + a[1] > 0 || a[2] >= 3)
    .sort((x, y) => y[1][0] * 10 + y[1][1] * 3 + y[1][2] - (x[1][0] * 10 + x[1][1] * 3 + x[1][2]))
    .slice(0, DISCOVER_CAP)
    .map(([id]) => ({ id, name: names.get(Number(id))! }))

  const batches = await mapLimit(chunk(candidates, 100), GITHUB_CONCURRENCY, (b) => fetchMetaByNames(b.map((c) => c.name)))
  const metas = batches.flat().filter((m): m is RepoMeta => !!m)
  const byId = new Map(metas.map((m) => [m.id, m]))
  const keep: RepoMeta[] = []
  for (const c of candidates) {
    const m = byId.get(Number(c.id))
    if (m && m.stars >= TRACK_MIN_STARS && !m.isFork) keep.push(m)
    else state.rejected[c.id] = epochDay
  }
  // Forget old rejections so the map can't grow without bound.
  for (const [id, d] of Object.entries(state.rejected)) if (epochDay - d >= 7) delete state.rejected[id]
  log('discover: gharchive', { looked: candidates.length, kept: keep.length })
  return keep
}
