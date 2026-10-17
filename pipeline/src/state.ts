// Pipeline state, persisted in KV as gzipped JSON. One write of `state` per run (+ `windows` once a day).
import type { Activity } from './ingest-gharchive.ts'
import type { TrustRecord } from './trust.ts'
import { kvGet, kvPut } from './cf.ts'
import { gunzipJson, gzipJson } from './util.ts'

/** [nodeId, stars, forks, starsAtDayStart, forksAtDayStart, enrichedAtEpochDay, archived 0|1, lastSnapshotEpochHour] */
export type Tracked = [string, number, number, number, number, number, number, number?]

export type SeedTask = { q: string; after: string | null }

export type State = {
  v: 1
  day: string // UTC day the *AtDayStart baselines belong to
  lastHour: string | null // last GH Archive hour processed
  d1: { day: string; written: number } // rows written to D1 today (guard, PLAN 6.10)
  repos: Record<string, Tracked> // tracked universe, keyed by numeric repo id
  rejected: Record<string, number> // GH Archive repos checked and not tracked → epoch day checked
  activity: Record<string, Activity> // GH Archive activity by UTC day (today and yesterday)
  seed: { built: boolean; queue: SeedTask[]; recentDay: string | null }
  trust?: Record<string, TrustRecord> // fake-star verdicts by repo id (absent in state written before M4)
}

/** Window sums from finalized daily_stats rows: id → [stars7, stars30, forks7, activity7, forks30, starsAllHistory]. The last two are absent in windows written before 2026-10-18. */
export type Windows = { asOf: string | null; historyDays: number; sums: Record<string, [number, number, number, number, number?, number?]> }

export function emptyState(day: string): State {
  return { v: 1, day, lastHour: null, d1: { day, written: 0 }, repos: {}, rejected: {}, activity: {}, seed: { built: false, queue: [], recentDay: null } }
}

export async function loadState(today: string): Promise<State> {
  const buf = await kvGet('state')
  return buf ? gunzipJson<State>(buf) : emptyState(today)
}

export const saveState = (s: State) => kvPut('state', gzipJson(s))

export async function loadWindows(): Promise<Windows> {
  const buf = await kvGet('windows')
  return buf ? gunzipJson<Windows>(buf) : { asOf: null, historyDays: 0, sums: {} }
}

export const saveWindows = (w: Windows) => kvPut('windows', gzipJson(w))
