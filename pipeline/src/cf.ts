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

/** Seed the guard with the rows already written today (kept in KV state). */
export function initWriteBudget(alreadyWrittenToday: number) {
  writtenTodayBefore = alreadyWrittenToday
}

export const d1Usage = () => ({ writtenThisRun, readThisRun, writtenToday: writtenTodayBefore + writtenThisRun })

/** Fail before writing if `estimatedRows` would push today's total past the guard. */
export function assertWriteBudget(estimatedRows: number) {
  const projected = writtenTodayBefore + writtenThisRun + estimatedRows
  if (projected > D1_DAILY_WRITE_GUARD) {
    throw new Error(`D1 write guard: ${projected} rows today would exceed ${D1_DAILY_WRITE_GUARD}`)
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
    throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body.errors)} — ${sql.slice(0, 120)}`)
  }
  const r = body.result[0]
  writtenThisRun += r.meta?.rows_written ?? 0
  readThisRun += r.meta?.rows_read ?? 0
  return r
}

/**
 * Write many rows with one statement per chunk: `sql` must read rows from `json_each(?1)`.
 * Each row counts as ~2 written rows when the table has one index.
 */
export async function d1BulkWrite(sql: string, rows: unknown[], rowsPerChunk = 500, writeFactor = 2) {
  if (rows.length === 0) return
  assertWriteBudget(rows.length * writeFactor)
  for (const part of chunk(rows, rowsPerChunk)) await d1(sql, [JSON.stringify(part)])
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
