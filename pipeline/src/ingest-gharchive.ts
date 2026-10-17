// GH Archive ingest. Since A1 this is a discovery + activity signal only: GH Archive now captures a
// small, unreliable fraction of star events, so star *gains* come from snapshots (snapshot.ts).
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { MAX_HOURS_PER_RUN, FIRST_RUN_LOOKBACK_HOURS } from './config.ts'
import { log } from './util.ts'

/** Per-repo counts for one UTC day: [sampledStars, forkEvents, issueAndPrEvents, pushEvents]. */
export type Activity = Record<string, [number, number, number, number]>

export type IngestResult = {
  lastHour: string | null // ISO hour 'YYYY-MM-DDTHH' of the last processed file
  activityByDay: Record<string, Activity>
  names: Map<number, string> // repo id → latest name seen
  hours: number
}

const KIND: Record<string, number> = { WatchEvent: 0, ForkEvent: 1, IssuesEvent: 2, PullRequestEvent: 2, PushEvent: 3 }

const hourKey = (d: Date) => d.toISOString().slice(0, 13)
const fileName = (d: Date) => `${d.toISOString().slice(0, 10)}-${d.getUTCHours()}.json.gz`

/** Process every complete hour after `lastHour` whose file exists (404 = not published yet: stop). */
export async function ingestGhArchive(lastHour: string | null, now: Date): Promise<IngestResult> {
  const currentHour = Date.parse(`${hourKey(now)}:00:00Z`)
  let t = lastHour ? Date.parse(`${lastHour}:00:00Z`) + 3_600_000 : currentHour - FIRST_RUN_LOOKBACK_HOURS * 3_600_000
  const result: IngestResult = { lastHour, activityByDay: {}, names: new Map(), hours: 0 }

  while (t < currentHour && result.hours < MAX_HOURS_PER_RUN) {
    const d = new Date(t)
    const url = `https://data.gharchive.org/${fileName(d)}`
    const started = Date.now()
    const res = await fetch(url)
    if (res.status === 404) {
      log('gharchive: not published yet, stopping', { hour: hourKey(d) })
      break
    }
    if (!res.ok || !res.body) throw new Error(`GH Archive ${url} failed: ${res.status}`)

    const day = d.toISOString().slice(0, 10)
    const activity = (result.activityByDay[day] ??= {})
    let bytes = 0
    let events = 0
    const starred = new Set<number>()
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
    body.on('data', (c: Buffer) => (bytes += c.length))
    const lines = createInterface({ input: body.pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line) continue
      events++
      // Cheap pre-filter before JSON.parse: most lines are event types we skip.
      const typeMatch = /"type":"(\w+)"/.exec(line)
      const kind = typeMatch ? KIND[typeMatch[1]] : undefined
      if (kind === undefined) continue
      const e = JSON.parse(line) as { repo: { id: number; name: string } }
      const id = e.repo.id
      result.names.set(id, e.repo.name)
      const a = (activity[id] ??= [0, 0, 0, 0])
      a[kind]++
      if (kind === 0) starred.add(id)
    }
    result.hours++
    result.lastHour = hourKey(d)
    // Measurement asked for in PLAN 6.1: size, parse time and distinct starred repos per hour.
    log('gharchive hour', { hour: result.lastHour, mb: +(bytes / 1e6).toFixed(1), seconds: +((Date.now() - started) / 1000).toFixed(1), events, starredRepos: starred.size })
    t += 3_600_000
  }
  return result
}
