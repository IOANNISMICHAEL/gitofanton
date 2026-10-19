import { gzipSync, gunzipSync } from 'node:zlib'

export const DAY_MS = 86_400_000

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var ${name}`)
  return v
}

export const utcDay = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Run fn over items with at most `limit` in flight, preserving result order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export const gzipJson = (v: unknown) => gzipSync(Buffer.from(JSON.stringify(v)))
export const gunzipJson = <T>(buf: Buffer): T => JSON.parse(gunzipSync(buf).toString('utf8')) as T

const timings: Record<string, number> = {}

/** Time an async step; totals are printed with `stepTimings()` at the end of the run. */
export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    return await fn()
  } catch (e) {
    // Name the step in the error, so the public annotation says where a run stopped.
    if (e instanceof Error && !e.message.startsWith('[')) e.message = `[${name}] ${e.message}`
    throw e
  } finally {
    timings[name] = +((Date.now() - t0) / 1000).toFixed(1)
    console.log(`step ${name}: ${timings[name]}s`)
  }
}

export const stepTimings = () => ({ ...timings })

export function log(msg: string, data?: Record<string, unknown>) {
  console.log(data ? `${msg} ${JSON.stringify(data)}` : msg)
}

/** A response body that is not JSON (an HTML error page from a proxy or an outage). Worth retrying. */
export class NotJsonError extends Error {}

/** Parses a response as JSON; an HTML error page becomes a NotJsonError naming the service and status. */
export async function readJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new NotJsonError(`${what} returned ${res.status} with a non-JSON body: ${text.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
}
