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

/**
 * Which time tabs each list has (owner, 2026-10-18). null = the list has no tabs.
 *   trending: fastest growing, size-adjusted, per window; All time = since tracking began
 *   top:      most stars gained this week / month; All time = most stars overall
 *   rising, gems: one list each (new repos by this week's gain; small fast-growing projects)
 */
export const LIST_WINDOWS: Record<ListName, (Window | null)[]> = {
  trending: ['today', 'week', 'month', 'all'],
  top: ['week', 'month', 'all'],
  rising: [null],
  gems: [null],
}

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
  /** Stars gained per window; `all` = gained since tracking began (17 Oct 2026). */
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
  return repos
    .filter((r) => isEligible(r) && r.gain[w] > 0)
    .sort((a, b) => score(b.gain[w], b.stars) - score(a.gain[w], a.stars) || b.gain[w] - a.gain[w])
}

/** Most stars gained in the window (not size-adjusted); All time: most stars overall. */
export function top(repos: Scored[], w: Window) {
  const eligible = repos.filter((r) => isEligible(r))
  if (w === 'all') return eligible.sort(byStars)
  return eligible.filter((r) => r.gain[w] > 0).sort((a, b) => b.gain[w] - a.gain[w] || byStars(a, b))
}

export function rising(repos: Scored[], now: Date) {
  return repos
    .filter((r) => isEligible(r) && r.gain.week > 0 && ageDays(r.createdAt, now) <= RISING_MAX_AGE_DAYS)
    .sort((a, b) => b.gain.week - a.gain.week)
}

/** 50–2,000 stars, >= 20 stars this week, some fork/issue/PR activity; ordered by growth relative to size. */
export function gems(repos: Scored[]) {
  return repos
    .filter(
      (r) =>
        isEligible(r) &&
        r.stars >= GEMS_MIN_STARS &&
        r.stars <= GEMS_MAX_STARS &&
        r.gain.week >= GEMS_MIN_GAIN_7D &&
        r.forks.week + r.activity7 > 0,
    )
    .sort((a, b) => b.gain.week / b.stars - a.gain.week / a.stars)
}

export function rank(list: ListName, repos: Scored[], w: Window | null, now: Date): Scored[] {
  switch (list) {
    case 'trending':
      return trending(repos, w ?? 'week')
    case 'top':
      return top(repos, w ?? 'all')
    case 'rising':
      return rising(repos, now)
    case 'gems':
      return gems(repos)
  }
}

/** The window whose gain a list shows next to each item. */
export const gainWindow = (list: ListName, w: Window | null): Window => w ?? 'week'

export const isNew = (r: Scored, now: Date) => ageDays(r.createdAt, now) <= RISING_MAX_AGE_DAYS
