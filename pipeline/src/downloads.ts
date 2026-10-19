// Weekly package downloads (npm, PyPI), refreshed a seventh of the packages each day.
import { log, mapLimit, sleep, chunk, readJson } from './util.ts'

type Pkg = { id: number; package: string; package_registry: string }

async function getJson<T>(url: string, attempt = 0): Promise<T | null> {
  const res = await fetch(url, { headers: { 'user-agent': 'git-of-anton-pipeline (+https://gitofanton.com)' } })
  if (res.status === 404) return null
  if (res.status === 429 && attempt < 3) {
    await sleep(Number(res.headers.get('retry-after') ?? 5) * 1000 + 1000)
    return getJson<T>(url, attempt + 1)
  }
  if (!res.ok) return null
  return readJson<T>(res, `downloads ${url}`)
}

/** npm: unscoped names in bulk (≤ 128 per request); scoped names one by one (bulk doesn't support them). */
async function npmWeekly(names: string[]) {
  const out = new Map<string, number>()
  const unscoped = names.filter((n) => !n.startsWith('@'))
  const scoped = names.filter((n) => n.startsWith('@'))
  for (const part of chunk(unscoped, 128)) {
    const d = await getJson<Record<string, { downloads: number } | null>>(`https://api.npmjs.org/downloads/point/last-week/${part.map(encodeURIComponent).join(',')}`)
    if (part.length === 1 && d && 'downloads' in d) out.set(part[0], (d as unknown as { downloads: number }).downloads)
    else for (const [k, v] of Object.entries(d ?? {})) if (v) out.set(k, v.downloads)
  }
  await mapLimit(scoped, 4, async (n) => {
    const d = await getJson<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-week/${n.replace('/', '%2F')}`)
    if (d) out.set(n, d.downloads)
  })
  return out
}

/** PyPI via pypistats.org: 60 requests/minute, so one per ~1.1 s. */
async function pypiWeekly(names: string[]) {
  const out = new Map<string, number>()
  for (const n of names) {
    const d = await getJson<{ data: { last_week: number } }>(`https://pypistats.org/api/packages/${encodeURIComponent(n.toLowerCase())}/recent`)
    if (d) out.set(n, d.data.last_week)
    await sleep(1100)
  }
  return out
}

export async function fetchWeeklyDownloads(pkgs: Pkg[]): Promise<[number, number][]> {
  const npm = pkgs.filter((p) => p.package_registry === 'npm')
  const pypi = pkgs.filter((p) => p.package_registry === 'pypi')
  const [n, p] = [await npmWeekly(npm.map((x) => x.package)), await pypiWeekly(pypi.map((x) => x.package))]
  const rows: [number, number][] = []
  for (const x of npm) if (n.has(x.package)) rows.push([x.id, n.get(x.package)!])
  for (const x of pypi) if (p.has(x.package)) rows.push([x.id, p.get(x.package)!])
  log('downloads', { npm: npm.length, npmFound: n.size, pypi: pypi.length, pypiFound: p.size })
  return rows
}

/** Monday of the current UTC week, YYYY-MM-DD. */
export function weekOf(d: Date) {
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10)
}
