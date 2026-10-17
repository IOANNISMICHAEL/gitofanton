// Tunable constants. score.ts constants are published on /methodology — keep them in sync.

export const MIN_STARS_LISTED = 50 // a repo appears in any list only with >= this many total stars
export const DAILY_MIN_STARS = 3 // daily_stats rows are written only for repos gaining >= this many stars that day
export const RISING_MAX_AGE_DAYS = 90
export const GEMS_MIN_STARS = 50
export const GEMS_MAX_STARS = 2000
export const GEMS_MIN_GAIN_7D = 20

export const RADAR_SIZE = 50
export const RADAR_RINGS = [5, 10, 15, 20] // centre → outer, by total stars within the radar set

// Tracked universe (A1: star gains come from GitHub star-count snapshots, see PLAN.md).
export const SEED_MIN_STARS = 5000 // every repo at or above this is tracked
export const NEW_REPO_MIN_STARS = 50 // repos created in the last RISING_MAX_AGE_DAYS at or above this are tracked
export const TRACK_MIN_STARS = 50 // GH Archive discoveries below this are not tracked
export const SEARCH_PAGES_PER_RUN = 100
export const DISCOVER_CAP = 3000 // GH Archive repos looked up per run
export const ENRICH_STALE_DAYS = 7
export const ENRICH_CAP = 2000
// Parallel GraphQL requests. GitHub allows ~60 s of GraphQL server time per minute and a 100-repo lookup
// takes ~2 s, so anything above 1 in flight just earns 60 s "slow down" pauses (measured 2026-10-17).
export const GITHUB_CONCURRENCY = 1
// Idle for this fraction of each request's duration before the next one, keeping well under the
// 60 s/min server-time cap (1 in flight with no gap still drew 3 × 60 s pauses).
export const GITHUB_PACE_FACTOR = 0.6

// Tiered snapshots (snapshot.ts): moving repos every run, quiet repos about once a day.
export const MOVING_MIN_DAY_GAIN = 3 // stars gained since the start of the UTC day that make a repo "moving"
export const MOVING_MIN_WEEK_GAIN = 10 // finalized stars over the last 6 days that make a repo "moving"
export const QUIET_RECHECK_HOURS = 20
export const QUIET_RUNS_PER_DAY = 5 // quiet repos checked per run = quiet total / this (6 runs/day leaves slack)

export const MAX_HOURS_PER_RUN = 8 // GH Archive hourly files per run
export const FIRST_RUN_LOOKBACK_HOURS = 4

// D1 free limit is 100k rows written/day, split between the two jobs (each keeps its own count in KV).
export const D1_DAILY_WRITE_GUARD = 55_000 // data.yml
export const D1_DISCOVER_WRITE_GUARD = 35_000 // discover.yml (first MCP import spreads over ~3–4 days)
// Part of discover's daily share kept for repo linking and downloads while the first import is still running.
export const DISCOVER_RESERVE_WRITES = 10_000
export const TOOL_REPO_MIN_STARS = 10 // a tool's GitHub repo joins star tracking at or above this
export const TOOL_REPO_LOOKUPS_PER_DAY = 3000
export const TOOL_REPO_RECHECK_DAYS = 7
export const OUT_FILE_LIMIT = 18_000 // Workers static assets limit is 20,000 files per version
export const FORMULA_VERSION = 1

// Job-based categories (PLAN v2 §1). Labels live in config/categories.json; ids must match it.
export const CATEGORIES = [
  'ai', 'devtools', 'frontend', 'backend', 'data', 'devops', 'security',
  'gamedev', 'product', 'marketing', 'productivity', 'research', 'other',
] as const
export type Category = (typeof CATEGORIES)[number]

// Radar quadrants are item types (PLAN v2 §1). Until the Toolbox exists every item is a repo.
export const QUADRANTS = ['Repos', 'Skills', 'MCP servers', 'Agents & plugins'] as const

export const VIEW_SIZE = 500 // items per list view file; the browser sorts and paginates these
