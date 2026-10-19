// Pipeline entry point (data.yml, every 4 h). Order: GH Archive → snapshots → day rollover →
// discovery → enrichment → score → JSON → state. Writes generatedAt to $GITHUB_OUTPUT for the deploy check.
import { appendFileSync } from 'node:fs'
import { d1Usage, initWriteBudget, D1LimitError } from './cf.ts'
import { DAILY_MIN_STARS, ENRICH_CAP, ENRICH_STALE_DAYS, GITHUB_CONCURRENCY } from './config.ts'
import { loadOverrides, loadRules, makeCategoriser } from './categorise.ts'
import { runArchiveDiscovery, runSearchSeeds } from './discover.ts'
import { benchmarkSnapshotQuery, fetchMetaByNodeIds, fetchRecentStargazers, fetchSnapshots, graphqlStats, type RepoMeta } from './github.ts'
import { ingestGhArchive, type Activity } from './ingest-gharchive.ts'
import { readReposCached, upsertRepos, windowSums, writeDailyStats, type RepoRow } from './repos.ts'
import { CLASSIFIER_VERSION } from './classify.ts'
import type { Category } from './config.ts'
import type { Scored } from './score.ts'
import { planSnapshots } from './snapshot.ts'
import { loadState, loadWindows, saveState, saveWindows, type State, type Tracked, type Windows } from './state.ts'
import { DAY_MS, addDays, chunk, log, mapLimit, step, stepTimings, utcDay } from './util.ts'
import { writeAll } from './write-json.ts'
import { countTools, latestDownloads, readToolsCached } from './tools.ts'
import { writeToolbox } from './toolbox.ts'
import { writeRadars } from './radar.ts'
import { dirname } from 'node:path'
import { writeSearch } from './search.ts'
import { writeNews } from './news.ts'
import { selectPages, writePages, type ItemPaths } from './items.ts'
import { BURST_MIN_DAY_GAIN, STARGAZER_PAGES_FOR_BURST, coordinated, judge, loadBlocklist, makeBlocker, pickCandidates, youngIds } from './trust.ts'
import { rank } from './score.ts'

// The pipeline writes web/public/data; the site build that follows renders pages from it (A2).
const OUT_DIR = process.env.OUT_DIR ?? 'web/public'
const CACHE_DIR = process.env.PIPELINE_CACHE_DIR ?? '.cache/pipeline'

function mergeActivity(state: State, byDay: Record<string, Activity>) {
  for (const [day, act] of Object.entries(byDay)) {
    const target = (state.activity[day] ??= {})
    for (const [id, a] of Object.entries(act)) {
      const t = (target[id] ??= [0, 0, 0, 0])
      for (let i = 0; i < 4; i++) t[i] += a[i]
    }
  }
}

async function snapshotTiered(state: State, windows: Windows, recentActivity: Activity, nowHour: number) {
  const plan = planSnapshots(state.repos, windows, recentActivity, nowHour)
  const ids = [...plan.moving, ...plan.quiet]
  const batches = chunk(ids, 100)
  if (batches.length && process.env.SNAPSHOT_BENCHMARK !== '0') await benchmarkSnapshotQuery(batches[0].map((id) => state.repos[id][0]))
  const results = await mapLimit(batches, GITHUB_CONCURRENCY, (b) => fetchSnapshots(b.map((id) => state.repos[id][0])))
  const seen = new Set<string>()
  for (const snap of results.flat()) {
    const t = state.repos[snap.id]
    if (!t) continue
    seen.add(String(snap.id))
    t[1] = snap.stars
    t[2] = snap.forks
    t[6] = snap.isArchived ? 1 : 0
    t[7] = nowHour
  }
  let removed = 0
  for (const id of ids) {
    if (seen.has(id)) continue
    delete state.repos[id]
    removed++
  }
  // Only repos we asked about and GitHub didn't return are gone (deleted or made private).
  log('snapshot', { tracked: Object.keys(state.repos).length, moving: plan.moving.length, quietChecked: plan.quiet.length, quietTotal: plan.quietTotal, updated: seen.size, removed })
}

async function rollover(state: State, today: string) {
  const day = state.day
  const act = state.activity[day] ?? {}
  const rows: [number, string, number, number, number, number][] = []
  const prevDay: Record<string, number> = {}
  for (const [id, t] of Object.entries(state.repos)) {
    const stars = t[1] - t[3]
    if (stars > 0) prevDay[id] = stars
    if (stars >= DAILY_MIN_STARS) {
      const a = act[id] ?? [0, 0, 0, 0]
      rows.push([Number(id), day, stars, Math.max(0, t[2] - t[4]), a[3], a[2]])
    }
    t[3] = t[1]
    t[4] = t[2]
  }
  await writeDailyStats(rows)
  state.prevDay = prevDay
  log('rollover: daily_stats written', { day, rows: rows.length })

  const lastDay = addDays(today, -1)
  const { rows: sums, historyDays } = await windowSums(addDays(today, -29), addDays(today, -6), lastDay)
  await saveWindows({ asOf: lastDay, historyDays, sums: Object.fromEntries(sums.map((s) => [s.id, [s.s7, s.s30, s.f7, s.a7, s.f30, s.sAll]])) })
  state.day = today
  for (const d of Object.keys(state.activity)) if (d < addDays(today, -1)) delete state.activity[d]
}

function pickCategory(rule: Category, r: RepoRow): Category {
  if (rule !== 'other') return rule
  return r.category_v === CLASSIFIER_VERSION && r.category ? r.category : 'other'
}

async function runTrust(state: State, scored: Scored[], overrides: Record<string, { trusted?: boolean }>, now: Date, nowHour: number) {
  const records = (state.trust ??= {})
  const visible = [rank('trending', scored, 'today', now).slice(0, 100), rank('trending', scored, 'week', now).slice(0, 100)]
  const candidates = pickCandidates(visible, scored, records, nowHour)
  for (const r of candidates) {
    const dayStart = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
    const pages = r.gain.today >= BURST_MIN_DAY_GAIN ? STARGAZER_PAGES_FOR_BURST : 1
    const sample = await fetchRecentStargazers(state.repos[r.id][0], dayStart, pages)
    const { reason, signals } = judge(r, sample, now)
    records[r.id] = { h: nowHour, f: reason, s: youngIds(sample) }
    log('trust: checked', { repo: r.fullName, today: r.gain.today, week: r.gain.week, sampled: sample.length, signals, flagged: !!reason })
  }
  // Coordinated stars: compare stargazer samples checked in the last 7 days.
  const recent = Object.fromEntries(Object.entries(records).filter(([, v]) => nowHour - v.h < 7 * 24))
  const names = new Map(scored.map((r) => [String(r.id), r.fullName]))
  for (const [id, reason] of coordinated(recent, names)) if (!records[id].f) records[id].f = reason
  for (const [id, v] of Object.entries(records)) if (nowHour - v.h > 30 * 24) delete records[id]
  // Apply verdicts to this run's scores (the owner's `trusted` override wins).
  let flagged = 0
  for (const r of scored) {
    const f = overrides[r.fullName]?.trusted ? null : (records[r.id]?.f ?? null)
    r.flag = f
    if (f) flagged++
  }
  log('trust', { checked: candidates.length, flagged, records: Object.keys(records).length })
}

function track(state: State, metas: RepoMeta[], epochDay: number, nowHour: number) {
  for (const m of metas) {
    const existing = state.repos[m.id]
    if (existing) {
      existing[0] = m.nodeId
      existing[5] = epochDay
      continue
    }
    // Baseline = current count: gains are counted from the moment a repo is first tracked.
    state.repos[m.id] = [m.nodeId, m.stars, m.forks, m.stars, m.forks, epochDay, m.isArchived ? 1 : 0, nowHour] satisfies Tracked
  }
}

async function main() {
  const started = Date.now()
  const now = new Date()
  const today = utcDay(now)
  const epochDay = Math.floor(now.getTime() / DAY_MS)
  const nowHour = Math.floor(now.getTime() / 3_600_000)
  const categorise = makeCategoriser(loadRules())
  const isBlocked = makeBlocker(loadBlocklist())
  const overrides = loadOverrides()

  const [state, windows] = await step('load-state', () => Promise.all([loadState(today), loadWindows()]))
  if (state.d1.day !== today) state.d1 = { day: today, written: 0 }
  initWriteBudget(state.d1.written)
  log('state loaded', { tracked: Object.keys(state.repos).length, day: state.day, lastHour: state.lastHour, d1WrittenToday: state.d1.written })

  // 1. GH Archive: activity + discovery candidates.
  const ing = await step('gharchive', () => ingestGhArchive(state.lastHour, now))
  state.lastHour = ing.lastHour
  mergeActivity(state, ing.activityByDay)

  // 2. Star snapshots for everything already tracked.
  const recentActivity: Activity = { ...(state.activity[addDays(today, -1)] ?? {}), ...(state.activity[today] ?? {}) }
  await step('snapshot', () => snapshotTiered(state, windows, recentActivity, nowHour))

  // 3. First run of a new UTC day finalizes the previous one.
  let reloadWindows = false
  if (state.day !== today) {
    await step('rollover', () => rollover(state, today))
    reloadWindows = true
  }

  // 4. Discovery → new tracked repos.
  const archiveActivity: Activity = { ...(state.activity[addDays(today, -1)] ?? {}), ...(state.activity[today] ?? {}) }
  const found = [
    ...(await step('search-seeds', () => runSearchSeeds(state, today))),
    ...(await step('archive-discovery', () => runArchiveDiscovery(state, archiveActivity, ing.names, epochDay))),
  ]
  const fresh = new Map<number, RepoMeta>()
  for (const m of found) if (!state.repos[m.id] && !m.isFork) fresh.set(m.id, m)
  const newRepos = [...fresh.values()]
  await step('upsert-new', () => upsertRepos(newRepos.map((m) => ({ ...m, category: categorise(m) })), now.toISOString()))
  track(state, newRepos, epochDay, nowHour)
  log('discover: new repos tracked', { count: newRepos.length })

  // 5. Refresh stale metadata.
  const stale = Object.entries(state.repos)
    .filter(([, t]) => epochDay - t[5] >= ENRICH_STALE_DAYS)
    .sort((a, b) => a[1][5] - b[1][5])
    .slice(0, ENRICH_CAP)
  if (stale.length) {
    const metas = await step('enrich', async () => {
      const m = (await mapLimit(chunk(stale, 100), GITHUB_CONCURRENCY, (b) => fetchMetaByNodeIds(b.map(([, t]) => t[0])))).flat()
      await upsertRepos(m.map((r) => ({ ...r, category: categorise(r) })), now.toISOString())
      return m
    })
    track(state, metas, epochDay, nowHour)
    log('enrich', { stale: stale.length, refreshed: metas.length })
  }

  // 6. Score.
  const win = reloadWindows ? await loadWindows() : windows
  const { rows, changed } = await step('read-repos', () => readReposCached(CACHE_DIR))
  // Repos written by other jobs (discover.yml: toolbox repos >= 10 stars) start being tracked here.
  // Baseline = their stored star count; the next snapshot makes it exact.
  let adopted = 0
  for (const r of changed) {
    if (state.repos[r.id] || r.is_fork || !r.node_id || r.stars == null) continue
    state.repos[r.id] = [r.node_id, r.stars, r.forks ?? 0, r.stars, r.forks ?? 0, epochDay, r.is_archived ? 1 : 0, 0]
    adopted++
  }
  if (adopted) log('tracking repos added by other jobs', { adopted })
  const todayAct = state.activity[today] ?? {}
  // "Today" is the last 24 hours, not the UTC day so far: since midnight plus the matching share of
  // yesterday, so the list doesn't empty out at 00:00 UTC.
  const dayLeft = 1 - (now.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  const prevDay = state.prevDay ?? {}
  const scored: Scored[] = []
  for (const r of rows) {
    const t = state.repos[r.id]
    if (!t) continue
    const ov = overrides[r.full_name] ?? {}
    const s = win.sums[r.id] ?? [0, 0, 0, 0, 0, 0]
    const g1 = Math.max(0, t[1] - t[3])
    const g24 = g1 + Math.round((prevDay[r.id] ?? 0) * dayLeft)
    const f1 = Math.max(0, t[2] - t[4])
    const a = todayAct[r.id] ?? [0, 0, 0, 0]
    const topics = JSON.parse(r.topics ?? '[]') as string[]
    scored.push({
      id: r.id,
      fullName: r.full_name,
      description: r.description,
      language: r.language,
      topics,
      avatarUrl: r.avatar_url,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      // Categorised every run from the stored fields, so rule changes apply without re-fetching.
      // Rules first (topics are reliable); the classifier's stored pick (discover.yml) for what they leave in "other".
      category: ov.category ?? pickCategory(categorise({ topics, description: r.description, language: r.language }), r),
      stars: t[1],
      gain: { today: g24, week: g1 + s[0], month: g1 + s[1], all: g1 + (s[5] ?? s[1]) },
      forks: { today: f1, week: f1 + s[2], month: f1 + (s[4] ?? s[2]), all: t[2] },
      activity7: s[3] + a[2] + a[3],
      isFork: !!r.is_fork,
      isArchived: !!t[6] || !!r.is_archived,
      hidden: !!ov.hidden || isBlocked({ fullName: r.full_name, description: r.description }),
      flag: ov.trusted ? null : (state.trust?.[r.id]?.f ?? null),
    })
  }

  // 7. Trust: check the most visible repos for fake stars (PLAN v2 §7).
  await step('trust', () => runTrust(state, scored, overrides, now, nowHour))

  // 8. Item pages first (lists, radars and search link to them), then the JSON.
  const [tools, downloads] = await step('read-tools', () => Promise.all([readToolsCached(CACHE_DIR), latestDownloads()]))
  const pages = selectPages(scored, new Map(rows.map((r) => [r.id, r])), tools, downloads)
  const paths: ItemPaths = { repo: (id) => pages.repoPath.get(id), tool: (id) => pages.toolPath.get(id) }
  const out = await step('write-json', async () => writeAll(OUT_DIR, scored, now, {
    trackedRepos: Object.keys(state.repos).length,
    toolbox: countTools(tools, downloads),
    historyDays: win.historyDays,
    historyAsOf: win.asOf,
  }, paths))

  // 8b. Toolbox lists (skills, MCP servers, agents & plugins), radars, search, item page data.
  await step('toolbox', async () => {
    writeToolbox(OUT_DIR, tools, downloads, new Map(scored.map((s) => [s.id, s])), now, paths)
    writeRadars(OUT_DIR, scored, tools, downloads, paths)
    writeSearch(OUT_DIR, scored, tools, downloads, paths)
  })
  await step('item-pages', () => writePages(dirname(OUT_DIR), pages, now))
  await step('news', () => writeNews(OUT_DIR, '.cache/pipeline/last-good-data/news.json'))

  // 9. Persist state (one KV write).
  state.d1 = { day: today, written: d1Usage().writtenToday }
  await step('save-state', () => saveState(state))

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `generated_at=${out.generatedAt}\n`)
  const u = d1Usage()
  console.log(`::notice::D1: ${u.readThisRun.toLocaleString('en-US')} rows read, ${u.writtenThisRun.toLocaleString('en-US')} written this run`)
  log('done', {
    generatedAt: out.generatedAt,
    dataFiles: out.files,
    scored: scored.length,
    d1: d1Usage(),
    graphql: graphqlStats,
    seconds: Math.round((Date.now() - started) / 1000),
    steps: stepTimings(),
  })
}

main().catch((e) => {
  // The account's daily D1 limit: not a code failure. data.yml redeploys the last good data instead.
  if (e instanceof D1LimitError) {
    console.log(`::warning::${e.message}. The site keeps its last good data until the limit resets at 00:00 UTC.`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'limited=true\n')
    process.exit(0)
  }
  console.error(e)
  // Annotations are public (readable without signing in), unlike the log.
  console.log(`::error::${String(e instanceof Error ? e.message : e).replace(/\s+/g, ' ').slice(0, 900)}`)
  process.exit(1)
})
