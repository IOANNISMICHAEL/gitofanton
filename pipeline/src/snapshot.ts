// Which tracked repos get a star snapshot this run.
//
// GitHub caps GraphQL at ~60 s of server time per minute, and a 100-repo star lookup costs ~2 s,
// so checking all ~27k repos every run takes ~9 minutes whatever the parallelism (measured 2026-10-17).
// "Moving" repos are checked every run; "quiet" ones about once a day, oldest first.
import { MOVING_MIN_DAY_GAIN, MOVING_MIN_WEEK_GAIN, QUIET_RECHECK_HOURS, QUIET_RUNS_PER_DAY } from './config.ts'
import type { Activity } from './ingest-gharchive.ts'
import type { Tracked, Windows } from './state.ts'

export type SnapshotPlan = { moving: string[]; quiet: string[]; quietTotal: number }

export function planSnapshots(
  repos: Record<string, Tracked>,
  windows: Windows,
  recentActivity: Activity,
  nowHour: number,
): SnapshotPlan {
  const moving: string[] = []
  const quietDue: [string, number][] = []
  let quietTotal = 0
  for (const [id, t] of Object.entries(repos)) {
    const gainedToday = t[1] - t[3] >= MOVING_MIN_DAY_GAIN
    const gainedThisWeek = (windows.sums[id]?.[0] ?? 0) >= MOVING_MIN_WEEK_GAIN
    const a = recentActivity[id]
    const activeOnArchive = !!a && a[0] + a[1] > 0 // sampled star or fork events
    if (gainedToday || gainedThisWeek || activeOnArchive) {
      moving.push(id)
      continue
    }
    quietTotal++
    const last = t[7] ?? 0
    if (nowHour - last >= QUIET_RECHECK_HOURS) quietDue.push([id, last])
  }
  // Spread the quiet set over the day's runs; oldest checks first.
  const quietCap = Math.ceil(quietTotal / QUIET_RUNS_PER_DAY)
  const quiet = quietDue
    .sort((x, y) => x[1] - y[1])
    .slice(0, quietCap)
    .map(([id]) => id)
  return { moving, quiet, quietTotal }
}
