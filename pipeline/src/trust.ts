// Trust layer (PLAN v2 §7): content blocklist and fake-star checks.
//
// Checks run on the repos people actually see (top of the lists and the radar) plus any big burst,
// at most TRUST_CHECKS_PER_RUN per run; a verdict is kept TRUST_RECHECK_HOURS before re-checking.
// Flag = new-account stargazers, coordinated stars, or burst + no engagement (burst alone is often
// a Hacker News front page).
import { readFileSync } from 'node:fs'
import type { Scored } from './score.ts'

export const TRUST_CHECKS_PER_RUN = 15
export const STARGAZER_PAGES_FOR_BURST = 5 // up to 500 stargazers, enough to cover the whole day for most bursts
export const TRUST_RECHECK_HOURS = 72
export const BURST_MIN_DAY_GAIN = 200
export const BURST_MIN_WEEK_GAIN = 1000
export const BURST_SHARE = 0.6 // > 60% of the day's stars within one hour
export const NO_ENGAGEMENT_RATIO = 50 // stars per fork gained over the week
export const NEW_ACCOUNT_SHARE = 0.5
export const NEW_ACCOUNT_DAYS = 30
export const COORDINATED_SHARE = 0.3 // share of the smaller stargazer sample seen on the other repo
export const COORDINATED_MIN_SHARED = 10

export type Stargazer = { id: number; starredAt: string; createdAt: string; repos: number; followers: number }

/**
 * Kept in pipeline state per checked repo. s = ids of sampled stargazers whose account was under
 * YOUNG_ACCOUNT_DAYS old when they starred: real fans of one project often star its siblings too,
 * but the same set of young accounts showing up on unrelated repos is a campaign.
 */
export type TrustRecord = { h: number; f: string | null; s: number[] }
export const YOUNG_ACCOUNT_DAYS = 90

export const youngIds = (sample: Stargazer[]) =>
  sample.slice(0, 100).filter((s) => Date.parse(s.starredAt) - Date.parse(s.createdAt) < YOUNG_ACCOUNT_DAYS * 24 * HOUR_MS).map((s) => s.id)

const HOUR_MS = 3_600_000

// ---------- blocklist ----------

type Blocklist = { terms: string[]; repos: string[] }

export function loadBlocklist(): Blocklist {
  return JSON.parse(readFileSync(new URL('../../config/blocklist.json', import.meta.url), 'utf8')) as Blocklist
}

export function makeBlocker(b: Blocklist) {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![a-z0-9])(?:${b.terms.map(escape).join('|')})(?![a-z0-9])`, 'i')
  const repos = new Set(b.repos.map((r) => r.toLowerCase()))
  return (r: { fullName: string; description: string | null }) =>
    repos.has(r.fullName.toLowerCase()) || re.test(r.fullName.replace(/[-_./]/g, ' ')) || (!!r.description && re.test(r.description))
}

// ---------- fake-star checks (pure) ----------

const HOUR = 3_600_000
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Largest number of stars inside any 60-minute window. */
export function busiestHour(times: number[]): number {
  const t = [...times].sort((a, b) => a - b)
  let best = 0
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i] - t[j] > HOUR) j++
    best = Math.max(best, i - j + 1)
  }
  return best
}

export function judge(r: Scored, sample: Stargazer[], now: Date): { reason: string | null; signals: string[] } {
  const signals: string[] = []
  const dayStart = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)

  // 1. Burst: share of today's stars that arrived in the busiest hour. If the sample doesn't reach back to
  // midnight (> 500 stars today) the share is understated, so this errs towards not flagging.
  const today = sample.map((s) => Date.parse(s.starredAt)).filter((t) => t >= dayStart)
  const burst = r.gain.today >= BURST_MIN_DAY_GAIN && today.length >= 30 && busiestHour(today) / r.gain.today > BURST_SHARE
  if (burst) signals.push(`Burst: ${pct(busiestHour(today) / r.gain.today)} of today's stars arrived within one hour`)

  // 2. No engagement: many stars per fork and no commits or issue/PR activity in 7 days.
  const ratio = r.gain.week / Math.max(1, r.forks.week)
  const stale = !r.pushedAt || now.getTime() - Date.parse(r.pushedAt) > 7 * 24 * HOUR
  const noEngagement = r.gain.week >= 100 && ratio > NO_ENGAGEMENT_RATIO && stale && r.activity7 === 0
  if (noEngagement) signals.push(`No engagement: ${Math.round(ratio)} stars per fork and no commits or issues in 7 days`)

  // 3. New accounts: most recent stargazers are brand-new, empty accounts (first 100 only).
  const recent = sample.slice(0, 100)
  const fresh = recent.filter(
    (s) => Date.parse(s.starredAt) - Date.parse(s.createdAt) < NEW_ACCOUNT_DAYS * 24 * HOUR && s.repos === 0 && s.followers < 2,
  )
  const newAccounts = recent.length >= 30 && fresh.length / recent.length > NEW_ACCOUNT_SHARE
  if (newAccounts) signals.push(`New accounts: ${pct(fresh.length / recent.length)} of recent stargazers are new, empty accounts`)

  const reason = newAccounts ? signals[signals.length - 1] : burst && noEngagement ? signals.join('; ') : null
  return { reason, signals }
}

/** Pairs of checked repos (different owners) whose young-account stargazers overlap heavily. */
export function coordinated(records: Record<string, TrustRecord>, names: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  const owner = (fullName?: string) => fullName?.split('/')[0].toLowerCase()
  const entries = Object.entries(records).filter(([, r]) => r.s.length >= COORDINATED_MIN_SHARED)
  const sets = entries.map(([id, r]) => [id, new Set(r.s)] as const)
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const [a, sa] = sets[i]
      const [b, sb] = sets[j]
      if (owner(names.get(a)) && owner(names.get(a)) === owner(names.get(b))) continue
      const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa]
      let shared = 0
      for (const x of small) if (large.has(x)) shared++
      if (shared >= COORDINATED_MIN_SHARED && shared / small.size >= COORDINATED_SHARE) {
        const share = pct(shared / small.size)
        const msg = (other: string) => `Coordinated: ${shared} new accounts starring it also starred ${names.get(other) ?? 'another tracked repo'} (${share})`
        if (!out.has(a)) out.set(a, msg(b))
        if (!out.has(b)) out.set(b, msg(a))
      }
    }
  }
  return out
}

/** Which visible repos to check this run: most visible first, skipping fresh verdicts. */
export function pickCandidates(visible: Scored[][], all: Scored[], records: Record<string, TrustRecord>, nowHour: number): Scored[] {
  const seen = new Set<number>()
  const out: Scored[] = []
  const bursts = all.filter((r) => r.gain.today >= BURST_MIN_DAY_GAIN || r.gain.week >= BURST_MIN_WEEK_GAIN)
  // Interleave the visible lists so each contributes its top items first.
  const queues = [bursts, ...visible].map((l) => [...l])
  while (out.length < TRUST_CHECKS_PER_RUN && queues.some((q) => q.length)) {
    for (const q of queues) {
      const r = q.shift()
      if (!r || seen.has(r.id)) continue
      seen.add(r.id)
      const rec = records[r.id]
      if (rec && nowHour - rec.h < TRUST_RECHECK_HOURS) continue
      out.push(r)
      if (out.length >= TRUST_CHECKS_PER_RUN) break
    }
  }
  return out
}
