// Thin Cloudflare REST clients for D1 and KV, plus the D1 daily write-budget guard (PLAN 6.10).
import { D1_DAILY_WRITE_GUARD } from './config.ts'
import { chunk, env, log, sleep } from './util.ts'

const API = 'https://api.cloudflare.com/client/v4'

function headers(extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${env('CLOUDFLARE_API_TOKEN')}`, ...extra }
}

async function cfFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init)
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(1000 * 2 ** attempt)
    return cfFetch(url, init, attempt + 1)
  }
  return res
}

// ---------- D1 ----------

type D1Meta = { rows_read?: number; rows_written?: number }
type D1Result<T> = { results: T[]; meta: D1Meta }

let writtenThisRun = 0
let readThisRun = 0
let writtenTodayBefore = 0
let guard = D1_DAILY_WRITE_GUARD

/**
 * Seed the guard with the rows this job already wrote today (kept in KV). Each job has its own
 * share of the free 100k/day so they never need to coordinate: data.yml and discover.yml.
 */
export function initWriteBudget(alreadyWrittenToday: number, dailyGuard = D1_DAILY_WRITE_GUARD) {
  writtenTodayBefore = alreadyWrittenToday
  guard = dailyGuard
}

/** Rows that can still be written today under this job's guard. */
export const writeBudgetLeft = () => guard - writtenTodayBefore - writtenThisRun

/** Rows this run may read before it stops cleanly (Infinity = no cap). D1 free tier: 5M reads/day for all jobs. */
let readCap = Infinity
export const setReadCap = (rows: number) => {
  readCap = rows
}

export const d1Usage = () => ({ writtenThisRun, readThisRun, writtenToday: writtenTodayBefore + writtenThisRun })

/** Today's write budget is used up: not a failure, the work resumes on the next day's run. */
export class WriteBudgetError extends Error {}

/** Stop before writing if `estimatedRows` would push today's total past the guard. */
export function assertWriteBudget(estimatedRows: number) {
  const projected = writtenTodayBefore + writtenThisRun + estimatedRows
  if (projected > guard) {
    throw new WriteBudgetError(`D1 write guard: ${projected} rows today would exceed ${guard}`)
  }
}

export async function d1<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<D1Result<T>> {
  const url = `${API}/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/d1/database/${env('D1_DATABASE_ID')}/query`
  const res = await cfFetch(url, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ sql, params }),
  })
  const body = (await res.json()) as { success: boolean; errors?: unknown; result?: D1Result<T>[] }
  if (!res.ok || !body.success || !body.result?.[0]) {
    throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body.errors)}: ${sql.slice(0, 120)}`)
  }
  const r = body.result[0]
  writtenThisRun += r.meta?.rows_written ?? 0
  readThisRun += r.meta?.rows_read ?? 0
  if (readThisRun > readCap) throw new WriteBudgetError(`D1 read cap: ${readThisRun} rows read this run (cap ${readCap})`)
  return r
}

/**
 * Write many rows with one statement per chunk: `sql` must read rows from `json_each(?1)`.
 * Each row counts as ~2 written rows when the table has one index.
 */
export async function d1BulkWrite(sql: string, rows: unknown[], rowsPerChunk = 500, writeFactor = 2, extraParams: unknown[] = []) {
  if (rows.length === 0) return
  assertWriteBudget(rows.length * writeFactor)
  for (const part of chunk(rows, rowsPerChunk)) await d1(sql, [JSON.stringify(part), ...extraParams])
}

// ---------- KV ----------

function kvUrl(key: string) {
  return `${API}/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/storage/kv/namespaces/${env('KV_NAMESPACE_ID')}/values/${encodeURIComponent(key)}`
}

export async function kvGet(key: string): Promise<Buffer | null> {
  const res = await cfFetch(kvUrl(key), { headers: headers() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`KV get ${key} failed (${res.status}): ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function kvPut(key: string, value: Buffer) {
  const res = await cfFetch(kvUrl(key), {
    method: 'PUT',
    headers: headers({ 'content-type': 'application/octet-stream' }),
    body: new Uint8Array(value),
  })
  if (!res.ok) throw new Error(`KV put ${key} failed (${res.status}): ${await res.text()}`)
  log(`kv put ${key}`, { bytes: value.length })
}
