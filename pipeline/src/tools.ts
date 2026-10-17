// D1 access for toolbox items (tools, tool_downloads).
import { createHash } from 'node:crypto'
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
}

export const contentHash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16)

// Unchanged records (same content_hash) are skipped by the WHERE on the update: no row is written.
const UPSERT_TOOLS = `
INSERT INTO tools (type, slug, name, title, description, repo_url, version, package, package_registry, remote,
                   website, status, category, first_seen, source_updated_at, content_hash)
SELECT j->>'type', j->>'slug', j->>'name', j->>'title', j->>'description', j->>'repoUrl', j->>'version',
       j->>'package', j->>'packageRegistry', j->>'remote', j->>'website', j->>'status', j->>'category',
       j->>'firstSeen', j->>'sourceUpdatedAt', j->>'hash'
FROM (SELECT value AS j FROM json_each(?1)) WHERE true
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name, title = excluded.title, description = excluded.description,
  repo_url = excluded.repo_url, version = excluded.version, package = excluded.package,
  package_registry = excluded.package_registry, remote = excluded.remote, website = excluded.website,
  status = excluded.status, category = excluded.category, source_updated_at = excluded.source_updated_at,
  content_hash = excluded.content_hash,
  -- a changed repo URL must be resolved again
  repo_id = CASE WHEN tools.repo_url IS excluded.repo_url THEN tools.repo_id END,
  repo_checked_at = CASE WHEN tools.repo_url IS excluded.repo_url THEN tools.repo_checked_at END
WHERE tools.content_hash IS NOT excluded.content_hash`

/** Upsert tools; `hash` covers everything shown, so only new or changed records cost a write. tools has one UNIQUE index (slug): ~2 rows written per changed row. */
export async function upsertTools(rows: (ToolRow & { hash: string })[]) {
  await d1BulkWrite(UPSERT_TOOLS, rows, 300, 2)
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
    `UPDATE tools SET repo_id = (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = tools.id), repo_checked_at = ?2
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
