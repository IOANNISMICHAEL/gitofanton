// Official MCP Registry client (https://registry.modelcontextprotocol.io, public, no key).
import { log, sleep } from './util.ts'

const BASE = 'https://registry.modelcontextprotocol.io/v0/servers'

export type RegistryServer = {
  server: {
    name: string
    title?: string
    description?: string
    version?: string
    websiteUrl?: string
    repository?: { url?: string; source?: string; subfolder?: string }
    packages?: { registryType?: string; identifier?: string }[]
    remotes?: { type?: string; url?: string }[]
  }
  _meta?: Record<string, { status?: string; publishedAt?: string; updatedAt?: string; isLatest?: boolean }>
}

type Page = { servers: RegistryServer[]; metadata: { nextCursor?: string } }

async function getPage(params: URLSearchParams, attempt = 0): Promise<Page> {
  try {
    const res = await fetch(`${BASE}?${params}`, { headers: { 'user-agent': 'git-of-anton-pipeline (+https://gitofanton.com)' } })
    if (!res.ok) throw new Error(`MCP Registry ${res.status}`)
    return (await res.json()) as Page
  } catch (e) {
    if (attempt >= 4) throw e
    await sleep(2000 * 2 ** attempt)
    return getPage(params, attempt + 1)
  }
}

/**
 * Pages through the latest version of every server, from `cursor`, optionally only those updated
 * since `updatedSince`. onPage returns false when it could not take the page (write budget reached):
 * the crawl stops and returns that page's cursor to resume from next time (null when finished).
 */
export async function crawlRegistry(
  opts: { cursor: string | null; updatedSince: string | null },
  onPage: (servers: RegistryServer[]) => Promise<boolean>,
): Promise<{ resumeCursor: string | null; pages: number }> {
  let cursor = opts.cursor
  let pages = 0
  for (;;) {
    const params = new URLSearchParams({ limit: '100', version: 'latest' })
    if (cursor) params.set('cursor', cursor)
    if (opts.updatedSince) params.set('updated_since', opts.updatedSince)
    const page = await getPage(params)
    if (!(await onPage(page.servers))) {
      log('mcp registry: stopping early, will resume', { cursor, pages })
      return { resumeCursor: cursor, pages }
    }
    pages++
    const next = page.metadata.nextCursor ?? null
    if (!next) return { resumeCursor: null, pages }
    cursor = next
  }
}

export const officialMeta = (s: RegistryServer) => s._meta?.['io.modelcontextprotocol.registry/official'] ?? {}

/** owner/name from a GitHub URL, or null. */
export function githubRepo(url: string | undefined | null): string | null {
  if (!url) return null
  const m = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url.trim())
  return m ? `${m[1]}/${m[2]}` : null
}
