export interface Env {
  ASSETS: Fetcher
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      // /api/contact lands in M7.
      return json({ error: 'not_found' }, 404)
    }

    if (url.pathname.startsWith('/repo/')) {
      // M5 replaces this with shard lookup + HTMLRewriter meta injection.
      return env.ASSETS.fetch(request)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
