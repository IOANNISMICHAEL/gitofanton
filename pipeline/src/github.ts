// GitHub GraphQL client: batched repo lookups, star snapshots and search, with rate-limit logging.
import { GITHUB_PACE_FACTOR } from './config.ts'
import { env, log, sleep, NotJsonError, readJson } from './util.ts'

export type RepoMeta = {
  id: number
  nodeId: string
  fullName: string
  description: string | null
  language: string | null
  topics: string[]
  license: string | null
  homepage: string | null
  avatarUrl: string | null
  stars: number
  forks: number
  createdAt: string
  pushedAt: string | null
  isFork: boolean
  isArchived: boolean
}

export type Snapshot = { id: number; nodeId: string; stars: number; forks: number; isArchived: boolean }

const META_FRAGMENT = `fragment M on Repository {
  id databaseId nameWithOwner description primaryLanguage { name }
  repositoryTopics(first: 10) { nodes { topic { name } } }
  licenseInfo { spdxId } homepageUrl stargazerCount forkCount createdAt pushedAt isFork isArchived
  owner { avatarUrl(size: 80) }
}`

const SNAP_FRAGMENT = `fragment S on Repository { id databaseId stargazerCount forkCount isArchived }`

type RawMeta = {
  id: string
  databaseId: number
  nameWithOwner: string
  description: string | null
  primaryLanguage: { name: string } | null
  repositoryTopics: { nodes: { topic: { name: string } }[] }
  licenseInfo: { spdxId: string } | null
  homepageUrl: string | null
  stargazerCount: number
  forkCount: number
  createdAt: string
  pushedAt: string | null
  isFork: boolean
  isArchived: boolean
  owner: { avatarUrl: string } | null
}

function toMeta(r: RawMeta): RepoMeta {
  return {
    id: r.databaseId,
    nodeId: r.id,
    fullName: r.nameWithOwner,
    description: r.description,
    language: r.primaryLanguage?.name ?? null,
    topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
    license: r.licenseInfo?.spdxId && r.licenseInfo.spdxId !== 'NOASSERTION' ? r.licenseInfo.spdxId : null,
    homepage: r.homepageUrl || null,
    avatarUrl: r.owner?.avatarUrl ?? null,
    stars: r.stargazerCount,
    forks: r.forkCount,
    createdAt: r.createdAt,
    pushedAt: r.pushedAt,
    isFork: r.isFork,
    isArchived: r.isArchived,
  }
}

export const graphqlStats = { requests: 0, cost: 0, remaining: -1, throttled: 0, requestSeconds: 0 }

// One shared pause for all in-flight workers: when GitHub says "slow down", everyone waits once,
// instead of each request sleeping its own 60 s.
let pausedUntil = 0

async function graphql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  const wait = pausedUntil - Date.now()
  if (wait > 0) await sleep(wait)
  const t0 = Date.now()
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${env('GH_TOKEN')}`,
      'content-type': 'application/json',
      'user-agent': 'git-of-anton-pipeline',
    },
    body: JSON.stringify({ query: `${query}\n${query.includes('...M') ? META_FRAGMENT : ''}\n${query.includes('...S') ? SNAP_FRAGMENT : ''}`, variables }),
  })
  graphqlStats.requests++
  const took = Date.now() - t0
  graphqlStats.requestSeconds += took / 1000
  pausedUntil = Math.max(pausedUntil, Date.now() + took * GITHUB_PACE_FACTOR)
  const retryAfter = Number(res.headers.get('retry-after') ?? 0)
  if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 5) {
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt
    // Only the first worker to hit the limit extends the pause; others just queue behind it.
    if (pausedUntil < Date.now() + backoff / 2) {
      pausedUntil = Date.now() + backoff
      graphqlStats.throttled++
      log(`github graphql ${res.status}, pausing all requests`, { waitMs: backoff, attempt })
    }
    return graphql<T>(query, variables, attempt + 1)
  }
  let body: { data?: T & { rateLimit?: { cost: number; remaining: number } }; errors?: { type?: string; path?: unknown[]; message: string }[] }
  try {
    body = await readJson(res, 'GitHub GraphQL')
  } catch (e) {
    // GitHub's "unicorn" error page: wait and retry like a 5xx.
    if (!(e instanceof NotJsonError) || attempt >= 5) throw e
    await sleep(2000 * 2 ** attempt)
    return graphql<T>(query, variables, attempt + 1)
  }
  if (!res.ok || !body.data) throw new Error(`GitHub GraphQL failed (${res.status}): ${JSON.stringify(body.errors ?? body).slice(0, 500)}`)
  // Errors tied to one repo (deleted, renamed, DMCA-blocked) carry a path and leave that entry null: skip them.
  // Errors without a path mean the whole query failed.
  const fatal = body.errors?.filter((e) => !e.path?.length)
  if (fatal?.length) throw new Error(`GitHub GraphQL errors: ${JSON.stringify(fatal).slice(0, 500)}`)
  if (body.errors?.length) log('github graphql: skipped repos', { count: body.errors.length, types: [...new Set(body.errors.map((e) => e.type))] })
  if (body.data.rateLimit) {
    graphqlStats.cost += body.data.rateLimit.cost
    graphqlStats.remaining = body.data.rateLimit.remaining
  }
  return body.data
}

/** Full metadata for up to 100 node ids. Missing (deleted) repos are omitted. */
export async function fetchMetaByNodeIds(nodeIds: string[]): Promise<RepoMeta[]> {
  const data = await graphql<{ nodes: (RawMeta | null)[] }>(
    `query($ids: [ID!]!) { rateLimit { cost remaining } nodes(ids: $ids) { ...M } }`,
    { ids: nodeIds },
  )
  return data.nodes.filter((n): n is RawMeta => !!n && !!n.databaseId).map(toMeta)
}

/** Star/fork counts for up to 100 node ids. */
export async function fetchSnapshots(nodeIds: string[]): Promise<Snapshot[]> {
  const data = await graphql<{ nodes: ({ id: string; databaseId: number; stargazerCount: number; forkCount: number; isArchived: boolean } | null)[] }>(
    `query($ids: [ID!]!) { rateLimit { cost remaining } nodes(ids: $ids) { ...S } }`,
    { ids: nodeIds },
  )
  return data.nodes
    .filter((n): n is NonNullable<typeof n> => !!n && !!n.databaseId)
    .map((n) => ({ id: n.databaseId, nodeId: n.id, stars: n.stargazerCount, forks: n.forkCount, isArchived: n.isArchived }))
}

/**
 * Full metadata for up to 100 "owner/name" strings (GH Archive and registries give names, not ids).
 * Result i belongs to names[i]: null when the repo is missing or private. Renamed repos resolve to their new name.
 */
export async function fetchMetaByNames(names: string[]): Promise<(RepoMeta | null)[]> {
  const parts = names.map((full, i) => {
    const [owner, name] = full.split('/')
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ...M }`
  })
  const data = await graphql<Record<string, RawMeta | null>>(`query { rateLimit { cost remaining } ${parts.join('\n')} }`)
  return names.map((_, i) => {
    const v = data[`r${i}`]
    return v && v.databaseId ? toMeta(v) : null
  })
}

/** One page (newest first) of a repo's stargazers with their star dates. */
export async function fetchStarDates(nodeId: string, before: string | null) {
  const data = await graphql<{ node: { stargazers: { edges: { starredAt: string }[]; pageInfo: { hasPreviousPage: boolean; startCursor: string | null } } } | null }>(
    `query($id: ID!, $before: String) { rateLimit { cost remaining } node(id: $id) { ... on Repository {
       stargazers(last: 100, before: $before) { edges { starredAt } pageInfo { hasPreviousPage startCursor } } } } }`,
    { id: nodeId, before },
  )
  const sg = data.node?.stargazers
  return { dates: (sg?.edges ?? []).map((e) => e.starredAt), more: !!sg?.pageInfo.hasPreviousPage, cursor: sg?.pageInfo.startCursor ?? null }
}

/** Time one 100-id batch with lighter query shapes, to learn what the star lookup actually costs. */
export async function benchmarkSnapshotQuery(nodeIds: string[]) {
  const shapes: [string, string][] = [
    ['full', 'id databaseId stargazerCount forkCount isArchived'],
    ['stars-only', 'id stargazerCount'],
    ['id-only', 'id'],
  ]
  const out: Record<string, number> = {}
  for (const [name, fields] of shapes) {
    const t0 = Date.now()
    await graphql(`query($ids: [ID!]!) { rateLimit { cost remaining } nodes(ids: $ids) { ... on Repository { ${fields} } } }`, { ids: nodeIds })
    out[name] = Date.now() - t0
  }
  log('benchmark: 100-repo lookup ms', out)
}

type RawStargazer = { starredAt: string; node: { databaseId: number; createdAt: string; repositories: { totalCount: number }; followers: { totalCount: number } } | null }

/**
 * Most recent stargazers of a repo, newest first, with the account facts the fake-star checks need.
 * Pages back (100 per request, up to maxPages) while stars are still newer than `since`.
 */
export async function fetchRecentStargazers(nodeId: string, since: number, maxPages: number) {
  const out: { id: number; starredAt: string; createdAt: string; repos: number; followers: number }[] = []
  let after: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const data: { node: { stargazers: { edges: RawStargazer[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } = await graphql(
      `query($id: ID!, $after: String) { rateLimit { cost remaining }
        node(id: $id) { ... on Repository {
          stargazers(first: 100, after: $after, orderBy: { field: STARRED_AT, direction: DESC }) {
            edges { starredAt node { databaseId createdAt repositories(privacy: PUBLIC) { totalCount } followers { totalCount } } }
            pageInfo { hasNextPage endCursor }
          } } } }`,
      { id: nodeId, after },
    )
    const conn = data.node?.stargazers
    if (!conn) break
    for (const e of conn.edges) {
      if (e.node) out.push({ id: e.node.databaseId, starredAt: e.starredAt, createdAt: e.node.createdAt, repos: e.node.repositories.totalCount, followers: e.node.followers.totalCount })
    }
    const oldest = conn.edges.at(-1)?.starredAt
    if (!conn.pageInfo.hasNextPage || !oldest || Date.parse(oldest) < since) break
    after = conn.pageInfo.endCursor
  }
  return out
}

export const restStats = { requests: 0, remaining: -1 }

/**
 * GitHub REST GET. Returns null for 404/409 (missing, empty repo). Throws RateLimited when the hourly
 * core limit is spent, so callers can stop and resume on the next run.
 */
export class RateLimited extends Error {}
export async function restGet<T>(path: string, attempt = 0): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `bearer ${env('GH_TOKEN')}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'git-of-anton-pipeline',
    },
  })
  restStats.requests++
  restStats.remaining = Number(res.headers.get('x-ratelimit-remaining') ?? -1)
  if (res.status === 404 || res.status === 409 || res.status === 451) return null
  if ((res.status === 403 || res.status === 429) && restStats.remaining === 0) throw new RateLimited('GitHub REST core limit reached')
  if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 3000 * 2 ** attempt)
    return restGet<T>(path, attempt + 1)
  }
  if (!res.ok) throw new Error(`GitHub REST ${path}: ${res.status}`)
  return readJson<T>(res, `GitHub REST ${path}`)
}

export async function searchCount(q: string): Promise<number> {
  const data = await graphql<{ search: { repositoryCount: number } }>(
    `query($q: String!) { rateLimit { cost remaining } search(query: $q, type: REPOSITORY, first: 1) { repositoryCount } }`,
    { q },
  )
  return data.search.repositoryCount
}

export async function searchPage(q: string, after: string | null): Promise<{ repos: RepoMeta[]; next: string | null }> {
  const data = await graphql<{ search: { nodes: (RawMeta | Record<string, never>)[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    `query($q: String!, $after: String) { rateLimit { cost remaining }
      search(query: $q, type: REPOSITORY, first: 100, after: $after) { nodes { ...M } pageInfo { hasNextPage endCursor } } }`,
    { q, after },
  )
  const repos = data.search.nodes.filter((n): n is RawMeta => 'databaseId' in n && !!n.databaseId).map(toMeta)
  return { repos, next: data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null }
}
