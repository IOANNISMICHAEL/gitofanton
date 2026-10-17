// Agents for the Toolbox (PLAN v2 §6, discover.yml step 3): a curated seed list plus repos tagged
// as coding agents with enough stars to matter.
import { readFileSync } from 'node:fs'
import { GITHUB_CONCURRENCY } from './config.ts'
import { sliceByStars } from './discover.ts'
import { fetchMetaByNames, searchPage, type RepoMeta } from './github.ts'
import { chunk, log, mapLimit } from './util.ts'

export const AGENT_TOPICS = ['coding-agent', 'ai-coding-agent', 'ai-coding-assistant', 'terminal-agent', 'agentic-coding']
export const AGENT_TOPIC_MIN_STARS = 100

export function loadSeedAgents(): string[] {
  return (JSON.parse(readFileSync(new URL('../../config/seed-agents.json', import.meta.url), 'utf8')) as { agents: string[] }).agents
}

export async function findAgents(): Promise<{ repos: RepoMeta[]; seeds: Set<number>; unresolved: string[] }> {
  const seedNames = loadSeedAgents()
  const seedMetas = (await mapLimit(chunk(seedNames, 100), GITHUB_CONCURRENCY, fetchMetaByNames)).flat()
  const out = new Map<number, RepoMeta>()
  const seeds = new Set<number>()
  const unresolved: string[] = []
  seedMetas.forEach((m, i) => {
    if (!m) return void unresolved.push(seedNames[i])
    out.set(m.id, m)
    seeds.add(m.id)
  })
  for (const topic of AGENT_TOPICS) {
    const queries: string[] = []
    await sliceByStars(AGENT_TOPIC_MIN_STARS, null, `topic:${topic}`, queries)
    for (const q of queries) {
      let after: string | null = null
      do {
        const { repos, next } = await searchPage(q, after)
        for (const r of repos) out.set(r.id, r)
        after = repos.length ? next : null
      } while (after)
    }
  }
  if (unresolved.length) log('agents: seed entries that no longer resolve (fix config/seed-agents.json)', { unresolved })
  log('agents: found', { total: out.size, seeds: seeds.size })
  return { repos: [...out.values()], seeds, unresolved }
}
