// D1 access for repos and daily_stats.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { d1, d1BulkWrite } from './cf.ts'
import type { Category } from './config.ts'
import type { RepoMeta } from './github.ts'
import { log } from './util.ts'

export type RepoRow = {
  id: number
  full_name: string
  description: string | null
  language: string | null
  topics: string // JSON array
  license: string | null
  homepage: string | null
  avatar_url: string | null
  created_at: string
  pushed_at: string | null
  node_id: string
  stars: number | null
  forks: number | null
  is_fork: number
  is_archived: number
  category: Category
  flag_reason: string | null
  category_v: number | null
  enriched_at: string | null
}

const UPSERT_REPOS = `
INSERT INTO repos (id, node_id, full_name, description, language, topics, license, homepage, avatar_url,
                   stars, forks, created_at, pushed_at, is_fork, is_archived, category, enriched_at)
SELECT j->>'id', j->>'nodeId', j->>'fullName', j->>'description', j->>'language', j->>'topics', j->>'license',
       j->>'homepage', j->>'avatarUrl', j->>'stars', j->>'forks', j->>'createdAt', j->>'pushedAt',
       j->>'isFork', j->>'isArchived', j->>'category', j->>'enrichedAt'
FROM (SELECT value AS j FROM json_each(?1)) WHERE true
ON CONFLICT(id) DO UPDATE SET
  node_id = excluded.node_id, full_name = excluded.full_name, description = excluded.description,
  language = excluded.language, topics = excluded.topics, license = excluded.license, homepage = excluded.homepage,
  avatar_url = excluded.avatar_url, stars = excluded.stars, forks = excluded.forks, created_at = excluded.created_at,
  pushed_at = excluded.pushed_at, is_fork = excluded.is_fork, is_archived = excluded.is_archived,
  category = excluded.category, enriched_at = excluded.enriched_at,
  -- fresh metadata: let the discovery job classify it again if the rules say "other"
  category_v = NULL`

export async function upsertRepos(repos: (RepoMeta & { category: Category })[], enrichedAt: string) {
  const rows = repos.map((r) => ({
    ...r,
    topics: JSON.stringify(r.topics),
    description: r.description?.slice(0, 500) ?? null,
    isFork: r.isFork ? 1 : 0,
    isArchived: r.isArchived ? 1 : 0,
    enrichedAt,
  }))
  // repos has one secondary index (full_name): ~2 written rows per upserted row.
  await d1BulkWrite(UPSERT_REPOS, rows, 400, 2)
}

const INSERT_DAILY = `
INSERT OR REPLACE INTO daily_stats (repo_id, day, stars, forks, pushes, issues)
SELECT value->>0, value->>1, value->>2, value->>3, value->>4, value->>5 FROM json_each(?1)`

/** rows: [repoId, day, stars, forks, pushes, issues] */
export async function writeDailyStats(rows: [number, string, number, number, number, number][]) {
  await d1BulkWrite(INSERT_DAILY, rows, 2000, 1)
}

/** Sum finalized daily_stats over the 7- and 30-day windows ending on `lastDay` (inclusive). */
export async function windowSums(from30: string, from7: string, lastDay: string) {
  const r = await d1<{ id: number; s7: number; s30: number; f7: number; a7: number; f30: number; sAll: number }>(
    `SELECT repo_id AS id,
            SUM(CASE WHEN day >= ?2 THEN stars ELSE 0 END) AS s7, SUM(CASE WHEN day >= ?1 THEN stars ELSE 0 END) AS s30,
            SUM(CASE WHEN day >= ?2 THEN forks ELSE 0 END) AS f7, SUM(CASE WHEN day >= ?1 THEN forks ELSE 0 END) AS f30,
            SUM(CASE WHEN day >= ?2 THEN pushes + issues ELSE 0 END) AS a7,
            SUM(stars) AS sAll
     FROM daily_stats WHERE day <= ?3 GROUP BY repo_id`,
    [from30, from7, lastDay],
  )
  const days = await d1<{ n: number }>(`SELECT COUNT(DISTINCT day) AS n FROM daily_stats WHERE day <= ?1`, [lastDay])
  return { rows: r.results, historyDays: days.results[0]?.n ?? 0 }
}

const REPO_COLUMNS = `id, node_id, stars, forks, full_name, description, language, topics, license, homepage, avatar_url, created_at, pushed_at,
  is_fork, is_archived, category, category_v, flag_reason, enriched_at`

async function readPaged(where: string, params: unknown[]): Promise<RepoRow[]> {
  const out: RepoRow[] = []
  let after = -1
  for (;;) {
    const r = await d1<RepoRow>(
      `SELECT ${REPO_COLUMNS} FROM repos WHERE id > ?1 ${where} ORDER BY id LIMIT 5000`,
      [after, ...params],
    )
    out.push(...r.results)
    if (r.results.length < 5000) return out
    after = r.results[r.results.length - 1].id
  }
}

type RepoCache = { asOf: string; rows: RepoRow[] }

/**
 * Repo metadata for scoring. Most rows never change between runs, so the previous run's copy is
 * kept on disk (restored by data.yml from the Actions cache) and only rows enriched since are read.
 */
export async function readReposCached(dir: string): Promise<{ rows: RepoRow[]; changed: RepoRow[] }> {
  const file = join(dir, 'repos.v4.json.gz') // bump the version when REPO_COLUMNS changes
  let cache: RepoCache | null = null
  if (existsSync(file)) {
    try {
      cache = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as RepoCache
    } catch {
      cache = null // corrupt cache: fall back to a full read
    }
  }
  let rows: RepoRow[]
  let changed: RepoRow[]
  if (cache) {
    changed = await readPaged('AND enriched_at > ?2', [cache.asOf])
    const byId = new Map(cache.rows.map((r) => [r.id, r]))
    for (const r of changed) byId.set(r.id, r)
    rows = [...byId.values()]
    log('read-repos: incremental', { cached: cache.rows.length, changed: changed.length })
  } else {
    rows = await readPaged('', [])
    changed = rows
    log('read-repos: full', { rows: rows.length })
  }
  const asOf = rows.reduce((m, r) => (r.enriched_at && r.enriched_at > m ? r.enriched_at : m), cache?.asOf ?? '')
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, gzipSync(Buffer.from(JSON.stringify({ asOf, rows } satisfies RepoCache))))
  return { rows, changed }
}

/** Repos whose stored category isn't from the current classifier version. */
export async function reposToClassify(version: number) {
  const r = await d1<{ id: number; full_name: string; description: string | null; topics: string; language: string | null }>(
    `SELECT id, full_name, description, topics, language FROM repos WHERE category_v IS NOT ?1`,
    [version],
  )
  return r.results
}

/** rows: [repoId, category] — stamps category_v; only repos the rules can't place are written. */
export async function setRepoCategories(rows: [number, string][], version: number) {
  await d1BulkWrite(
    `UPDATE repos SET category = (SELECT value->>1 FROM json_each(?1) WHERE value->>0 = repos.id), category_v = ?2
     WHERE id IN (SELECT value->>0 FROM json_each(?1))`,
    rows,
    1000,
    1,
    [version],
  )
}
