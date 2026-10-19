import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeed } from '../src/news.ts'

test('parseFeed: RSS and Atom, title + link + date only', () => {
  const rss = `<rss><channel><item><title><![CDATA[Hello &amp; welcome]]></title><link>https://a.example/1</link>
    <pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate><description>body never kept</description></item>
    <item><title>No link</title><pubDate>Mon, 19 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`
  assert.deepEqual(parseFeed(rss, 'x'), [{ t: 'Hello & welcome', u: 'https://a.example/1', d: '2026-10-19T08:00:00.000Z', s: 'x' }])
  const atom = `<feed><entry><title type="html">Atom post</title><link href="https://b.example/2" rel="alternate"/>
    <published>2026-10-18T10:00:00Z</published></entry></feed>`
  assert.deepEqual(parseFeed(atom, 'y').map((i) => i.u), ['https://b.example/2'])
})
