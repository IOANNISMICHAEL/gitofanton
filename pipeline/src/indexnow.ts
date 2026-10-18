// IndexNow (Bing, Yandex, Seznam, Naver and others share submissions): after each deploy, tell them
// which pages are new, plus the main pages once a day, so they are crawled within hours.
// The key is public by design: search engines check it at https://gitofanton.com/{key}.txt.
//
//   node pipeline/src/indexnow.ts web/out/sitemap.xml
import { readFileSync } from 'node:fs'
import { kvGet, kvPut } from './cf.ts'
import { chunk, gunzipJson, gzipJson } from './util.ts'

export const INDEXNOW_KEY = '08bb884e89f8bdeb6bc74e756618fb6b'
const HOST = 'gitofanton.com'
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 10_000 // the protocol's limit per request
const KV_KEY = 'indexnow'

type State = { day: string; sent: string[] }

/** Pages whose content changes every run: resubmitted once a day, not every 4 hours. */
export const isMainPage = (url: string) => new URL(url).pathname.split('/').filter(Boolean).length <= 1

export function toSubmit(all: string[], state: State | null, today: string) {
  const sent = new Set(state?.sent ?? [])
  const fresh = all.filter((u) => !sent.has(u))
  const daily = state?.day === today ? [] : all.filter((u) => isMainPage(u) && sent.has(u))
  return [...new Set([...daily, ...fresh])]
}

async function main() {
  const sitemap = process.argv[2]
  if (!sitemap) throw new Error('usage: indexnow.ts <sitemap.xml>')
  const all = [...readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const buf = await kvGet(KV_KEY)
  const state = buf ? gunzipJson<State>(buf) : null
  const today = new Date().toISOString().slice(0, 10)
  const urls = toSubmit(all, state, today)
  let ok = 0
  for (const urlList of chunk(urls, BATCH)) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList }),
    })
    // 200 = accepted, 202 = accepted, key check pending (first submissions).
    if (res.status === 200 || res.status === 202) ok += urlList.length
    else console.log(`::warning::IndexNow returned ${res.status} for ${urlList.length} URLs: ${(await res.text()).slice(0, 300)}`)
  }
  // Only what was accepted counts as sent; the rest is retried next run.
  const accepted = ok === urls.length ? urls : []
  const live = new Set(all)
  const sent = [...new Set([...(state?.sent ?? []).filter((u) => live.has(u)), ...accepted])]
  await kvPut(KV_KEY, gzipJson({ day: ok ? today : (state?.day ?? ''), sent } satisfies State))
  console.log(`::notice::IndexNow: ${urls.length} URLs to submit (${all.length} in sitemap), ${ok} accepted`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    // Never fail the deploy over IndexNow.
    console.log(`::warning::IndexNow: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`)
  })
}
