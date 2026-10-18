// Daily discovery job (discover.yml, PLAN v2 §6): new and changed Agent toolbox items.
// It only writes D1 and its own KV key; the 4-hourly data job picks up what it adds.
//   1. MCP servers from the official MCP Registry (first import resumable across days, then incremental)
//   2. Resolve each tool's GitHub repo; repos with >= TOOL_REPO_MIN_STARS join star tracking
//   3. Weekly npm / PyPI downloads, one seventh of the packages per day
import { d1Usage, initWriteBudget, kvGet, kvPut, setReadCap, writeBudgetLeft, WriteBudgetError } from './cf.ts'
import { D1_DISCOVER_WRITE_GUARD, DISCOVER_READ_CAP, DISCOVER_RESERVE_WRITES, TREE_SCANS_PER_RUN, GITHUB_CONCURRENCY, TOOL_REPO_LOOKUPS_PER_DAY, TOOL_REPO_MIN_STARS, TOOL_REPO_RECHECK_DAYS } from './config.ts'
import { loadRules, makeCategoriser, stripFormatWords } from './categorise.ts'
import { fetchWeeklyDownloads, weekOf } from './downloads.ts'
import { fetchMetaByNames, graphqlStats, restStats } from './github.ts'
import { crawlRegistry, githubRepo, officialMeta, type RegistryServer } from './mcp-registry.ts'
import { findCandidateRepos, scanRepo, sinceDay, type Found } from './skills.ts'
import { findAgents } from './agents.ts'
import type { RepoMeta } from './github.ts'
import { reposToClassify, setRepoCategories, upsertRepos } from './repos.ts'
import { CLASSIFIER_VERSION, loadClassifier, type Classifier } from './classify.ts'
import { contentHash, markRemoved, packagesForSlice, setToolCategories, setToolRepos, toolsNeedingRepo, toolsToClassify, upsertTools, writeDownloads, type ToolRow } from './tools.ts'
import { DAY_MS, chunk, gunzipJson, gzipJson, log, mapLimit, step, stepTimings, utcDay } from './util.ts'

type DiscoverState = {
  v: 1
  d1: { day: string; written: number }
  mcp: { cursor: string | null; crawlStartedAt: string | null; updatedSince: string | null }
  /** skills/plugins: when the last full candidate sweep ran, and the pushedAt each repo was last scanned at. */
  skills?: { fullSweepAt: string | null; scanned: Record<string, string> }
}

const KEY = 'discover-state'
const fresh = (day: string): DiscoverState => ({ v: 1, d1: { day, written: 0 }, mcp: { cursor: null, crawlStartedAt: null, updatedSince: null } })

function toToolRow(s: RegistryServer, categorise: ReturnType<typeof makeCategoriser>, now: string): ToolRow & { hash: string } {
  const sv = s.server
  const meta = officialMeta(s)
  const pkg = sv.packages?.find((p) => p.registryType === 'npm' || p.registryType === 'pypi') ?? sv.packages?.[0]
  const text = stripFormatWords([sv.title, sv.description, sv.name.split('/').pop()].filter(Boolean).join('. '))
  const row: ToolRow = {
    type: 'mcp',
    slug: `mcp/${sv.name.toLowerCase()}`,
    name: sv.name,
    title: sv.title ?? null,
    description: sv.description?.slice(0, 500) ?? null,
    repoUrl: sv.repository?.url ?? null,
    version: sv.version ?? null,
    package: pkg?.identifier ?? null,
    packageRegistry: pkg?.registryType ?? null,
    remote: sv.remotes?.length ? 1 : 0,
    website: sv.websiteUrl ?? null,
    status: meta.status ?? 'active',
    category: categorise({ topics: [], description: text, language: null }),
    firstSeen: meta.publishedAt ?? now,
    sourceUpdatedAt: meta.updatedAt ?? null,
  }
  // first_seen is excluded from the hash: it never changes after insert.
  const { firstSeen: _firstSeen, ...hashed } = row
  return { ...row, hash: contentHash(hashed) }
}

async function importMcp(state: DiscoverState, categorise: ReturnType<typeof makeCategoriser>, now: Date) {
  const nowIso = now.toISOString()
  const initial = !state.mcp.updatedSince
  if (initial && !state.mcp.crawlStartedAt) state.mcp.crawlStartedAt = nowIso
  let seen = 0
  const { resumeCursor, pages } = await crawlRegistry({ cursor: initial ? state.mcp.cursor : null, updatedSince: state.mcp.updatedSince }, async (servers) => {
    const base = servers.map((s) => toToolRow(s, categorise, nowIso))
    // Leave a reserve so linking and downloads still run on days the import is budget-bound.
    if (writeBudgetLeft() - DISCOVER_RESERVE_WRITES < base.length * 2) return false // resume tomorrow
    const rows = await refine(base, base.map(toolText))
    await upsertTools(rows)
    seen += rows.length
    return true
  })
  if (resumeCursor) {
    state.mcp.cursor = resumeCursor // only an unfinished first import resumes; incremental runs restart from updatedSince
  } else {
    // Overlap one day so nothing published during a run is missed; unchanged records cost nothing.
    const base = initial ? state.mcp.crawlStartedAt! : nowIso
    state.mcp.updatedSince = new Date(Date.parse(base) - DAY_MS).toISOString()
    state.mcp.cursor = null
    state.mcp.crawlStartedAt = null
  }
  log('mcp: imported', { initial, pages, servers: seen, finished: !resumeCursor })
}

async function resolveRepos(categorise: ReturnType<typeof makeCategoriser>, now: Date) {
  const recheckBefore = new Date(now.getTime() - TOOL_REPO_RECHECK_DAYS * DAY_MS).toISOString()
  const pending = await toolsNeedingRepo(Math.min(TOOL_REPO_LOOKUPS_PER_DAY, Math.max(0, Math.floor(writeBudgetLeft() / 3))), recheckBefore)
  const named = pending.map((t) => ({ id: t.id, name: githubRepo(t.repo_url) })).filter((t): t is { id: number; name: string } => !!t.name)
  // Many tools share one repo (monorepos of servers): look each repo up once.
  const unique = [...new Set(named.map((t) => t.name.toLowerCase()))]
  const results = (await mapLimit(chunk(unique, 100), GITHUB_CONCURRENCY, (b) => fetchMetaByNames(b))).flat()
  const byName = new Map(unique.map((n, i) => [n, results[i]]))
  const keep = [...new Map(results.filter((m) => m && m.stars >= TOOL_REPO_MIN_STARS && !m.isFork).map((m) => [m!.id, m!])).values()]
  await upsertRepos(keep.map((m) => ({ ...m, category: categorise(m) })), now.toISOString())
  await setToolRepos(named.map((t) => [t.id, byName.get(t.name.toLowerCase())?.id ?? null]), now.toISOString())
  log('repos: resolved', { tools: named.length, repos: unique.length, found: results.filter(Boolean).length, tracked: keep.length })
}

type Categorise = ReturnType<typeof makeCategoriser>

let classifier: Classifier = async (texts) => texts.map(() => null)
const CACHE_DIR = process.env.PIPELINE_CACHE_DIR ?? '.cache/pipeline'

/** Text the classifier reads for a toolbox item: what it does, without format words. */
export const toolText = (t: { name: string; title?: string | null; description?: string | null }) =>
  stripFormatWords([t.title, t.description, t.name.split('/').pop()].filter(Boolean).join('. '))

/** Classifier first; keeps the keyword-rule category when the classifier is unsure. Stamps the version either way. */
async function refine<T extends ToolRow & { hash: string }>(rows: T[], texts: string[]): Promise<T[]> {
  const cats = await classifier(texts)
  return rows.map((r, i) => {
    const row = { ...r, category: cats[i] ?? r.category, categoryV: CLASSIFIER_VERSION }
    return { ...row, hash: contentHash({ ...row, firstSeen: undefined, hash: undefined }) }
  })
}

/** Job first (from the item's own description), then the repo's category as a fallback. */
function categoriseItem(categorise: Categorise, text: string | null, repo: RepoMeta) {
  const c = categorise({ topics: [], description: stripFormatWords(text ?? ''), language: null })
  return c !== 'other' ? c : categorise(repo)
}

function hashed(row: ToolRow) {
  const { firstSeen: _firstSeen, ...rest } = row
  return { ...row, hash: contentHash(rest) }
}

function itemRow(f: Found, repo: RepoMeta, categorise: Categorise, nowIso: string): ToolRow & { hash: string } {
  const repoKey = repo.fullName.toLowerCase()
  return hashed({
    type: f.kind,
    slug: `${f.kind}/${repoKey}/${f.path.toLowerCase()}`,
    name: f.name.slice(0, 200),
    title: null,
    description: f.description?.slice(0, 500) ?? null,
    repoUrl: `https://github.com/${repo.fullName}`,
    repoId: repo.id,
    path: f.path,
    version: null,
    package: null,
    packageRegistry: null,
    remote: 0,
    website: repo.homepage,
    status: 'active',
    category: categoriseItem(categorise, f.description, repo),
    firstSeen: nowIso,
    sourceUpdatedAt: repo.pushedAt,
  })
}

async function discoverSkills(state: DiscoverState, categorise: Categorise, now: Date) {
  const nowIso = now.toISOString()
  const sk = (state.skills ??= { fullSweepAt: null, scanned: {} })
  // A full sweep weekly (catches newly tagged repos); otherwise only repos pushed since yesterday.
  const full = !sk.fullSweepAt || now.getTime() - Date.parse(sk.fullSweepAt) > 7 * DAY_MS
  const candidates = await findCandidateRepos(full ? null : sinceDay(sk.fullSweepAt!))
  if (full) sk.fullSweepAt = nowIso
  // Unscanned repos first (most stars first), then repos with new pushes since their last scan.
  const isNew = (r: RepoMeta) => !(String(r.id) in sk.scanned)
  const due = candidates
    .filter((r) => !r.isFork && sk.scanned[r.id] !== (r.pushedAt ?? ''))
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)) || b.stars - a.stars)
    .slice(0, TREE_SCANS_PER_RUN)
  const rows: (ToolRow & { hash: string })[] = []
  const reposWithItems: RepoMeta[] = []
  const scannedIds: number[] = []
  const perRepo: Record<string, { skills: number; plugins: number }> = {}
  for (const r of due) {
    if (writeBudgetLeft() < rows.length * 2 + 2000) break // keep room for this run's writes
    const found = await scanRepo(r)
    if (found === null) {
      log('skills: GitHub REST limit reached, resuming next run', { scanned: scannedIds.length })
      break
    }
    sk.scanned[r.id] = r.pushedAt ?? ''
    scannedIds.push(r.id)
    if (!found.length) continue
    reposWithItems.push(r)
    for (const f of found) rows.push(itemRow(f, r, categorise, nowIso))
    perRepo[r.fullName] = { skills: found.filter((f) => f.kind === 'skill').length, plugins: found.filter((f) => f.kind === 'plugin').length }
  }
  await upsertRepos(reposWithItems.map((m) => ({ ...m, category: categorise(m) })), nowIso)
  await upsertTools(await refine(rows, rows.map(toolText)))
  await markRemoved(scannedIds, rows.map((r) => r.slug))
  const entries = Object.entries(perRepo)
  log('skills: scanned', {
    candidates: candidates.length,
    due: due.length,
    scanned: scannedIds.length,
    reposWithItems: reposWithItems.length,
    skills: rows.filter((r) => r.type === 'skill').length,
    plugins: rows.filter((r) => r.type === 'plugin').length,
  })
  // Per-repo counts for spot checks against GitHub (PLAN M6 acceptance).
  log('skills: per repo (first 40)', Object.fromEntries(entries.slice(0, 40)))
}

async function discoverAgents(categorise: Categorise, now: Date) {
  const nowIso = now.toISOString()
  const { repos, seeds } = await findAgents()
  const rows = repos.map((r) =>
    hashed({
      type: 'agent',
      slug: `agent/${r.fullName.toLowerCase()}`,
      name: r.fullName.split('/')[1],
      title: r.fullName,
      description: r.description?.slice(0, 500) ?? null,
      repoUrl: `https://github.com/${r.fullName}`,
      repoId: r.id,
      path: null,
      version: null,
      package: null,
      packageRegistry: null,
      remote: 0,
      website: r.homepage,
      status: 'active',
      category: categorise(r),
      firstSeen: nowIso,
      sourceUpdatedAt: r.pushedAt,
    }),
  )
  await upsertRepos(repos.filter((r) => !r.isFork).map((m) => ({ ...m, category: categorise(m) })), nowIso)
  await upsertTools(await refine(rows, rows.map(toolText)))
  log('agents: written', { agents: rows.length, seeds: seeds.size })
}

/** Re-classify stored items the current classifier version hasn't seen (gradually, within the write budget). */
async function reclassify(categorise: Categorise) {
  const budget = Math.max(0, writeBudgetLeft() - 2000)
  const tools = await toolsToClassify(CLASSIFIER_VERSION, Math.min(budget, 20_000))
  const cats = await classifier(tools.map(toolText))
  const toolRows = tools.map((t, i) => [t.id, cats[i] ?? categorise({ topics: [], description: toolText(t), language: null })] as [number, string])
  await setToolCategories(toolRows, CLASSIFIER_VERSION)
  // Repos: the rules place most of them from topics; only those left in "other" get the classifier.
  const repos = await reposToClassify(CLASSIFIER_VERSION)
  const unplaced = repos.filter((r) => categorise({ topics: JSON.parse(r.topics ?? '[]'), description: r.description, language: r.language }) === 'other')
  const batch = unplaced.slice(0, Math.max(0, writeBudgetLeft() - 2000))
  const repoCats = await classifier(batch.map((r) => `${r.full_name.split('/')[1].replace(/[-_]/g, ' ')}. ${r.description ?? ''} ${JSON.parse(r.topics ?? '[]').join(' ')}`))
  await setRepoCategories(batch.map((r, i) => [r.id, repoCats[i] ?? 'other']), CLASSIFIER_VERSION)
  log('reclassify', { tools: tools.length, toolsPlaced: cats.filter(Boolean).length, reposUnplaced: unplaced.length, reposDone: batch.length, reposPlaced: repoCats.filter(Boolean).length })
}

async function refreshDownloads(now: Date) {
  const slice = Math.floor(now.getTime() / DAY_MS) % 7
  const pkgs = await packagesForSlice(slice, 7)
  const week = weekOf(now)
  // Check the budget before spending minutes on fetching (PyPI allows 60 requests/minute).
  if (writeBudgetLeft() < pkgs.length) {
    log('downloads: skipped, write budget used up today', { packages: pkgs.length })
    return
  }
  const rows = await fetchWeeklyDownloads(pkgs)
  await writeDownloads(rows.map(([id, n]) => [id, week, n]))
}

async function main() {
  const started = Date.now()
  const now = new Date()
  const today = utcDay(now)
  const categorise = makeCategoriser(loadRules())
  const buf = await kvGet(KEY)
  const state = buf ? gunzipJson<DiscoverState>(buf) : fresh(today)
  if (state.d1.day !== today) state.d1 = { day: today, written: 0 }
  initWriteBudget(state.d1.written, D1_DISCOVER_WRITE_GUARD)
  setReadCap(DISCOVER_READ_CAP)
  log('discover state', { mcp: state.mcp, d1WrittenToday: state.d1.written })

  classifier = await step('classifier', () => loadClassifier(`${CACHE_DIR}/hf`))
  // Each step stops cleanly when today's write budget runs out; the rest resumes on the next run.
  const steps: [string, () => Promise<unknown>][] = [
    ['mcp-registry', () => importMcp(state, categorise, now)],
    ['resolve-repos', () => resolveRepos(categorise, now)],
    ['agents', () => discoverAgents(categorise, now)],
    ['skills', () => discoverSkills(state, categorise, now)],
    ['downloads', () => refreshDownloads(now)],
    ['reclassify', () => reclassify(categorise)],
  ]
  try {
    for (const [name, fn] of steps) {
      try {
        await step(name, fn)
      } catch (e) {
        if (!(e instanceof WriteBudgetError)) throw e
        console.log(`::notice::${name}: ${e.message}; the remaining steps continue on the next run`)
        break
      }
    }
  } finally {
    // Save progress even after a failure, so a partial first import resumes instead of restarting.
    state.d1 = { day: today, written: d1Usage().writtenToday }
    await kvPut(KEY, gzipJson(state))
  }
  const u = d1Usage()
  console.log(`::notice::D1: ${u.readThisRun.toLocaleString('en-US')} rows read, ${u.writtenThisRun.toLocaleString('en-US')} written this run`)
  log('done', { d1: u, graphql: graphqlStats, rest: restStats, seconds: Math.round((Date.now() - started) / 1000), steps: stepTimings() })
}

main().catch((e) => {
  console.error(e)
  // Annotations are public (readable without signing in), unlike the log.
  console.log(`::error::${String(e instanceof Error ? e.message : e).replace(/\s+/g, ' ').slice(0, 900)}`)
  process.exit(1)
})
