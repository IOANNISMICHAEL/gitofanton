// Scoring and list selection (PLAN v2 §6). The formula and constants here are published on /methodology.
import {
  GEMS_MAX_STARS,
  GEMS_MIN_GAIN_7D,
  GEMS_MIN_STARS,
  MIN_STARS_LISTED,
  RISING_MAX_AGE_DAYS,
  type Category,
} from './config.ts'

export type Window = 'today' | 'week' | 'month' | 'all'
export const WINDOWS: Window[] = ['today', 'week', 'month', 'all']
export type ListName = 'trending' | 'rising' | 'gems' | 'top'
export const LISTS: ListName[] = ['trending', 'rising', 'gems', 'top']

export type Scored = {
  id: number
  fullName: string
  description: string | null
  language: string | null
  topics: string[]
  avatarUrl: string | null
  createdAt: string
  pushedAt: string | null
  category: Category
  stars: number
  /** Stars gained per window; `all` is total stars (All time = total, not gain since tracking began). */
  gain: Record<Window, number>
  /** Forks gained per window; `all` is total forks. */
  forks: Record<Window, number>
  activity7: number
  isFork: boolean
  isArchived: boolean
  hidden: boolean
  flag: string | null
}

/** momentum = g_w / log10(total_stars + 100). Not squared: squaring rewards the bursts bought stars produce. */
export const score = (gain: number, totalStars: number) => gain / Math.log10(totalStars + 100)

export function isEligible(r: Scored, showFlagged = false) {
  return r.stars >= MIN_STARS_LISTED && !r.isFork && !r.isArchived && !r.hidden && (showFlagged || !r.flag)
}

const ageDays = (createdAt: string, now: Date) => (now.getTime() - Date.parse(createdAt)) / 86_400_000
const byStars = (a: Scored, b: Scored) => b.stars - a.stars

export function trending(repos: Scored[], w: Window) {
  const eligible = repos.filter((r) => isEligible(r))
  if (w === 'all') return eligible.sort(byStars)
  return eligible
    .filter((r) => r.gain[w] > 0)
    .sort((a, b) => score(b.gain[w], b.stars) - score(a.gain[w], a.stars) || b.gain[w] - a.gain[w])
}

export function rising(repos: Scored[], w: Window, now: Date) {
  const young = repos.filter((r) => isEligible(r) && ageDays(r.createdAt, now) <= RISING_MAX_AGE_DAYS)
  if (w === 'all') return young.sort(byStars)
  return young.filter((r) => r.gain[w] > 0).sort((a, b) => b.gain[w] - a.gain[w])
}

/** Gems qualify on the week (50–2,000 stars, >= 20 stars this week, some fork/issue/PR activity); `w` only changes the order. */
export function gems(repos: Scored[], w: Window) {
  const list = repos.filter(
    (r) =>
      isEligible(r) &&
      r.stars >= GEMS_MIN_STARS &&
      r.stars <= GEMS_MAX_STARS &&
      r.gain.week >= GEMS_MIN_GAIN_7D &&
      r.forks.week + r.activity7 > 0,
  )
  if (w === 'all') return list.sort(byStars)
  return list.sort((a, b) => b.gain[w] / b.stars - a.gain[w] / a.stars)
}

export function top(repos: Scored[]) {
  return repos.filter((r) => isEligible(r)).sort(byStars)
}

export function rank(list: ListName, repos: Scored[], w: Window, now: Date): Scored[] {
  switch (list) {
    case 'trending':
      return trending(repos, w)
    case 'rising':
      return rising(repos, w, now)
    case 'gems':
      return gems(repos, w)
    case 'top':
      return top(repos)
  }
}

export const isNew = (r: Scored, now: Date) => ageDays(r.createdAt, now) <= RISING_MAX_AGE_DAYS
