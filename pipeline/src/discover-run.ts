// Daily discovery job (discover.yml, PLAN v2 §6): new and changed Agent toolbox items.
// It only writes D1 and its own KV key; the 4-hourly data job picks up what it adds.
//   1. MCP servers from the official MCP Registry (first import resumable across days, then incremental)
//   2. Resolve each tool's GitHub repo; repos with >= TOOL_REPO_MIN_STARS join star tracking
//   3. Weekly npm / PyPI downloads, one seventh of the packages per day
import { d1Usage, initWriteBudget, kvGet, kvPut, writeBudgetLeft } from './cf.ts'
import { D1_DISCOVER_WRITE_GUARD, GITHUB_CONCURRENCY, TOOL_REPO_LOOKUPS_PER_DAY, TOOL_REPO_MIN_STARS, TOOL_REPO_RECHECK_DAYS } from './config.ts'
import { loadRules, makeCategoriser, stripFormatWords } from './categorise.ts'
import { fetchWeeklyDownloads, weekOf } from './downloads.ts'
import { fetchMetaByNames, graphqlStats } from './github.ts'
import { crawlRegistry, githubRepo, officialMeta, type RegistryServer } from './mcp-registry.ts'
import { upsertRepos } from './repos.ts'
import { contentHash, packagesForSlice, setToolRepos, toolboxCounts, toolsNeedingRepo, upsertTools, writeDownloads, type ToolRow } from './tools.ts'
import { DAY_MS, chunk, gunzipJson, gzipJson, log, mapLimit, step, stepTimings, utcDay } from './util.ts'

type DiscoverState = {
  v: 1
  d1: { day: string; written: number }
  mcp: { cursor: string | null; crawlStartedAt: string | null; updatedSince: string | null }
}

const KEY = 'discover-state'
const fresh = (day: string): DiscoverState => ({ v: 1, d1: { day, written: 0 }, mcp: { cursor: null, crawlStartedAt: null, updatedSince: null } })

function toToolRow(s: RegistryServer, categorise: ReturnType<typeof makeCategoriser>, now: string): ToolRow & { hash: string } {
  const sv = s.server
  const meta = officialMeta(s)
  const pkg = sv.packages?.find((p) => p.registryType === 'npm' || p.registryType === 'pypi') ?? sv.packages?.[0]
  const text = stripFormatWords([sv.title, sv.description, sv.name.split('/').pop()].filter(Boolean).join(' — '))
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
    const rows = servers.map((s) => toToolRow(s, categorise, nowIso))
    if (writeBudgetLeft() < rows.length * 2) return false // resume tomorrow
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

async function refreshDownloads(now: Date) {
  const slice = Math.floor(now.getTime() / DAY_MS) % 7
  const pkgs = await packagesForSlice(slice, 7)
  const week = weekOf(now)
  const rows = await fetchWeeklyDownloads(pkgs)
  if (writeBudgetLeft() < rows.length) {
    log('downloads: skipped, write budget used up today', { rows: rows.length })
    return
  }
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
  log('discover state', { mcp: state.mcp, d1WrittenToday: state.d1.written })

  try {
    await step('mcp-registry', () => importMcp(state, categorise, now))
    await step('resolve-repos', () => resolveRepos(categorise, now))
    await step('downloads', () => refreshDownloads(now))
  } finally {
    // Save progress even after a failure, so a partial first import resumes instead of restarting.
    state.d1 = { day: today, written: d1Usage().writtenToday }
    await kvPut(KEY, gzipJson(state))
  }
  log('done', { toolbox: await toolboxCounts(), d1: d1Usage(), graphql: graphqlStats, seconds: Math.round((Date.now() - started) / 1000), steps: stepTimings() })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
