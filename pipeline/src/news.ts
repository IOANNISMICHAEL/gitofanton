// Newsletters for /news/ (PLAN v2 M13): title, source, date and link only, never the post body.
// A feed that fails keeps its items from the last good run, so one broken feed never empties the page.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { log } from './util.ts'

export const PER_FEED = 15
const FEEDS = (JSON.parse(readFileSync(new URL('../../config/feeds.json', import.meta.url), 'utf8')) as { feeds: { id: string; name: string; url: string }[] }).feeds

export type NewsItem = { t: string; u: string; d: string; s: string } // title, link, ISO date, source id

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1]

/** RSS <item> or Atom <entry>: title, link, date. Items without a usable link or date are skipped. */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0])
  const out: NewsItem[] = []
  for (const b of blocks) {
    const title = decode(tag(b, 'title') ?? '')
    const atomLink = b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)?.[1] ?? b.match(/<link[^>]*href="([^"]+)"/i)?.[1]
    const link = decode(tag(b, 'link') ?? '') || atomLink || ''
    const date = decode(tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date') ?? '')
    const t = Date.parse(date)
    if (!title || !/^https?:\/\//.test(link) || Number.isNaN(t)) continue
    out.push({ t: title.slice(0, 200), u: link, d: new Date(t).toISOString(), s: source })
  }
  return out.sort((a, b) => b.d.localeCompare(a.d)).slice(0, PER_FEED)
}

export async function writeNews(outDir: string, lastGood: string) {
  const previous: NewsItem[] = existsSync(lastGood) ? ((JSON.parse(readFileSync(lastGood, 'utf8')) as { items?: NewsItem[] }).items ?? []) : []
  const items: NewsItem[] = []
  const status: Record<string, number | string> = {}
  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, { headers: { 'user-agent': 'git-of-anton (+https://gitofanton.com)' }, signal: AbortSignal.timeout(20_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const got = parseFeed(await res.text(), f.id)
        if (!got.length) throw new Error('no items')
        items.push(...got)
        status[f.id] = got.length
      } catch (e) {
        const kept = previous.filter((x) => x.s === f.id)
        items.push(...kept)
        status[f.id] = `failed (${e instanceof Error ? e.message : e}), kept ${kept.length}`
      }
    }),
  )
  items.sort((a, b) => b.d.localeCompare(a.d))
  const p = join(outDir, 'data', 'news.json')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ sources: FEEDS.map((f) => ({ id: f.id, name: f.name })), total: items.length, items }))
  log('news', status)
  return items.length
}
