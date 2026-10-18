// D1 access for toolbox items (tools, tool_downloads).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { log } from './util.ts'
import { d1, d1BulkWrite } from './cf.ts'
import type { Category } from './config.ts'

export type ToolRow = {
  type: 'mcp' | 'skill' | 'agent' | 'plugin'
  slug: string
  name: string
  title: string | null
  description: string | null
  repoUrl: string | null
  version: string | null
  package: string | null
  packageRegistry: string | null
  remote: 0 | 1
  website: string | null
  status: string
  category: Category
  firstSeen: string
  sourceUpdatedAt: string | null
  repoId?: number | null // known up front for skills, plugins and agents; resolved later for MCP servers
  path?: string | null
  categoryV?: number | null // classifier version that set `category` (null = keyword rules)
}

export const contentHash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16)

// Unchanged records (same content_hash) are skipped by the WHERE on the update: no row is written.
const UPSERT_TOOLS = `
INSERT INTO tools (type, slug, name, title, description, repo_url, repo_id, path, version, package, package_registry, remote,
                   website, status, category, category_v, first_seen, source_updated_at, content_hash, changed_at)
SELECT j->>'type', j->>'slug', j->>'name', j->>'title', j->>'description', j->>'repoUrl', j->>'repoId', j->>'path', j->>'version',
       j->>'package', j->>'packageRegistry', j->>'remote', j->>'website', j->>'status', j->>'category', j->>'categoryV',
       j->>'firstSeen', j->>'sourceUpdatedAt', j->>'hash', ?2
FROM (SELECT value AS j FROM json_each(?1)) WHERE true
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name, title = excluded.title, description = excluded.description,
  repo_url = excluded.repo_url, version = excluded.version, package = excluded.package,
  package_registry = excluded.package_registry, remote = excluded.remote, website = excluded.website,
  status = excluded.status, category = excluded.category, category_v = excluded.category_v,
  source_updated_at = excluded.source_updated_at, content_hash = excluded.content_hash, changed_at = excluded.changed_at,
  -- a changed repo URL must be resolved again
  repo_id = CASE WHEN tools.repo_url IS excluded.repo_url THEN COALESCE(excluded.repo_id, tools.repo_id) ELSE excluded.repo_id END,
  path = excluded.path,
  repo_checked_at = CASE WHEN tools.repo_url IS excluded.repo_url THEN tools.repo_checked_at END
WHERE tools.content_hash IS NOT excluded.content_hash`

/** Upsert tools; `hash` covers everything shown, so only new or changed records cost a write. tools has one UNIQUE index (slug): ~2 rows written per changed row. */
export async function upsertTools(rows: (ToolRow & { hash: string })[]) {
  await d1BulkWrite(UPSERT_TOOLS, rows, 300, 2, [new Date().toISOString()])
}

/** Skills/plugins of rescanned repos that are no longer there: marked removed (kept for history). */
export async function markRemoved(repoIds: number[], keepSlugs: string[]) {
  if (!repoIds.length) return
  await d1(
    `UPDATE tools SET status = 'removed', content_hash = NULL, changed_at = ?3
     WHERE type IN ('skill', 'plugin') AND status != 'removed'
       AND repo_id IN (SELECT value FROM json_each(?1)) AND slug NOT IN (SELECT value FROM json_each(?2))`,
    [JSON.stringify(repoIds), JSON.stringify(keepSlugs), new Date().toISOString()],
  )
}

/** Tools whose GitHub repo still needs resolving (never checked, or checked over `recheckDays` ago and unresolved). */
export async function toolsNeedingRepo(limit: number, recheckBefore: string) {
  const r = await d1<{ id: number; repo_url: string }>(
    `SELECT id, repo_url FROM tools
     WHERE repo_id IS NULL AND repo_url LIKE 'https://github.com/%'
       AND (repo_checked_at IS NULL OR repo_checked_at < ?2)
     ORDER BY repo_checked_at IS NOT NULL, id LIMIT ?1`,
    [limit, recheckBefore],
  )
  return r.results
}

/** rows: [toolId, repoId | null] */
export async function setToolRepos(rows: [number, number | null][], checkedAt: string) {
  await d1BulkWrite(
    `UPDATE tools SET repo_id = (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = tools.id), repo_checked_at = ?2,
       changed_at = CASE WHEN repo_id IS NOT (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = tools.id) THEN ?2 ELSE changed_at END
     WHERE id IN (SELECT value->>0 FROM json_each(?1))`,
    rows,
    1000,
    1,
    [checkedAt],
  )
}

export async function packagesForSlice(slice: number, slices: number) {
  const r = await d1<{ id: number; package: string; package_registry: string }>(
    `SELECT id, package, package_registry FROM tools
     WHERE package IS NOT NULL AND package_registry IN ('npm', 'pypi') AND status = 'active' AND id % ?2 = ?1`,
    [slice, slices],
  )
  return r.results
}

/** rows: [toolId, week, downloads] */
export async function writeDownloads(rows: [number, string, number][]) {
  await d1BulkWrite(
    `INSERT OR REPLACE INTO tool_downloads (tool_id, week, downloads) SELECT value->>0, value->>1, value->>2 FROM json_each(?1)`,
    rows,
    2000,
    1,
  )
}

export async function toolboxCounts() {
  const r = await d1<{ type: string; n: number; with_repo: number; with_package: number }>(
    `SELECT type, COUNT(*) AS n, SUM(repo_id IS NOT NULL) AS with_repo, SUM(package IS NOT NULL) AS with_package
     FROM tools WHERE status = 'active' GROUP BY type`,
  )
  const dl = await d1<{ n: number }>(`SELECT COUNT(DISTINCT tool_id) AS n FROM tool_downloads`)
  return { byType: Object.fromEntries(r.results.map((x) => [x.type, { total: x.n, withRepo: x.with_repo, withPackage: x.with_package }])), withDownloads: dl.results[0]?.n ?? 0 }
}

// ---------- classification ----------

export async function toolsToClassify(version: number, limit: number) {
  const r = await d1<{ id: number; type: string; name: string; title: string | null; description: string | null; category: string }>(
    `SELECT id, type, name, title, description, category FROM tools
     WHERE status = 'active' AND category_v IS NOT ?1 ORDER BY id LIMIT ?2`,
    [version, limit],
  )
  return r.results
}

/** rows: [toolId, category]. Always stamps category_v so each row is classified once per version. */
export async function setToolCategories(rows: [number, string][], version: number) {
  await d1BulkWrite(
    `UPDATE tools SET category = (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = tools.id), category_v = ?2,
       changed_at = CASE WHEN category IS NOT (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = tools.id) THEN ?3 ELSE changed_at END
     WHERE id IN (SELECT value->>0 FROM json_each(?1))`,
    rows,
    1000,
    1,
    [version, new Date().toISOString()],
  )
}

// ---------- reading for the data job ----------

export type ToolRead = {
  id: number
  type: 'mcp' | 'skill' | 'agent' | 'plugin'
  slug: string
  name: string
  title: string | null
  description: string | null
  repo_url: string | null
  repo_id: number | null
  path: string | null
  package: string | null
  package_registry: string | null
  remote: number
  website: string | null
  status: string
  category: string
  first_seen: string
  changed_at: string | null
}

async function readToolsPaged(where: string, params: unknown[]): Promise<ToolRead[]> {
  const out: ToolRead[] = []
  let after = -1
  for (;;) {
    const r = await d1<ToolRead>(
      `SELECT id, type, slug, name, title, description, repo_url, repo_id, path, package, package_registry, remote,
              website, status, category, first_seen, changed_at
       FROM tools WHERE id > ?1 ${where} ORDER BY id LIMIT 5000`,
      [after, ...params],
    )
    out.push(...r.results)
    if (r.results.length < 5000) return out
    after = r.results[r.results.length - 1].id
  }
}

/** All tools, kept between runs in the pipeline cache; only rows changed since the last run are read. */
export async function readToolsCached(dir: string): Promise<ToolRead[]> {
  const file = join(dir, 'tools.v1.json.gz')
  let cache: { asOf: string; rows: ToolRead[] } | null = null
  if (existsSync(file)) {
    try {
      cache = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))
    } catch {
      cache = null
    }
  }
  let rows: ToolRead[]
  if (cache) {
    const changed = await readToolsPaged('AND changed_at > ?2', [cache.asOf])
    const byId = new Map(cache.rows.map((r) => [r.id, r]))
    for (const r of changed) byId.set(r.id, r)
    rows = [...byId.values()]
    log('read-tools: incremental', { cached: cache.rows.length, changed: changed.length })
  } else {
    rows = await readToolsPaged('', [])
    log('read-tools: full', { rows: rows.length })
  }
  const asOf = rows.reduce((m, r) => (r.changed_at && r.changed_at > m ? r.changed_at : m), cache?.asOf ?? '')
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, gzipSync(Buffer.from(JSON.stringify({ asOf, rows }))))
  return rows
}

/** Latest weekly downloads per tool (most recent week each tool has). */
export async function latestDownloads(): Promise<Map<number, number>> {
  const r = await d1<{ tool_id: number; downloads: number }>(
    `SELECT tool_id, downloads FROM tool_downloads d
     WHERE week = (SELECT MAX(week) FROM tool_downloads x WHERE x.tool_id = d.tool_id) AND week >= date('now', '-21 days')`,
  )
  return new Map(r.results.map((x) => [x.tool_id, x.downloads]))
}
