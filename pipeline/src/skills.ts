// Skills and plugins (PLAN v2 §6, discover.yml step 2): find repos that hold Agent Skills
// (SKILL.md) or Claude Code plugins (.claude-plugin/plugin.json), list each repo's files once per
// new push, and read each skill's name and description from its SKILL.md frontmatter.
import { TOOL_REPO_MIN_STARS } from './config.ts'
import { sliceByStars } from './discover.ts'
import { RateLimited, restGet, searchPage, type RepoMeta } from './github.ts'
import { addDays, log, mapLimit } from './util.ts'

/** Topics that mark a repo as holding skills or plugins. */
export const SKILL_TOPICS = [
  'agent-skills', 'agent-skill', 'claude-skills', 'claude-skill', 'claude-code-skills', 'codex-skills',
  'skills', 'skill-md', 'claude-code-plugin', 'claude-code-plugins', 'claude-plugin', 'claude-plugins',
]
export const MAX_SKILLS_PER_REPO = 300

export type Found = {
  kind: 'skill' | 'plugin'
  path: string // file path in the repo
  name: string
  description: string | null
}

// ---------- pure helpers (tested) ----------

/** Which files in a repo tree are skills or plugin manifests. */
export function classifyPaths(paths: string[]): { skills: string[]; plugins: string[] } {
  const skills = paths.filter((p) => /(^|\/)skill\.md$/i.test(p) && !/(^|\/)(node_modules|\.git|vendor|dist|build)\//.test(p))
  const plugins = paths.filter((p) => /(^|\/)\.claude-plugin\/plugin\.json$/.test(p))
  return { skills, plugins }
}

/** name and description from a SKILL.md YAML frontmatter (plain, quoted, or folded `>`/`|` values). */
export function parseFrontmatter(text: string): { name: string | null; description: string | null } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { name: null, description: null }
  const lines = m[1].split(/\r?\n/)
  const get = (key: string) => {
    const i = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l))
    if (i < 0) return null
    let v = lines[i].replace(new RegExp(`^${key}\\s*:\\s*`), '')
    if (/^[>|][-+]?\s*$/.test(v)) {
      const block: string[] = []
      for (let j = i + 1; j < lines.length && (/^\s+\S/.test(lines[j]) || lines[j].trim() === ''); j++) block.push(lines[j].trim())
      v = block.join(' ')
    }
    v = v.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
    return v || null
  }
  return { name: get('name'), description: get('description') }
}

/** Fallback skill name: the folder holding SKILL.md, or the repo name for a root SKILL.md. */
export function skillDirName(path: string, repoName: string) {
  const parts = path.split('/')
  return parts.length > 1 ? parts[parts.length - 2] : repoName
}

// ---------- network ----------

/** Candidate repos (>= TOOL_REPO_MIN_STARS) by topic; after the first full sweep, only those pushed recently. */
export async function findCandidateRepos(pushedSince: string | null): Promise<RepoMeta[]> {
  const out = new Map<number, RepoMeta>()
  for (const topic of SKILL_TOPICS) {
    const extra = `topic:${topic}${pushedSince ? ` pushed:>=${pushedSince}` : ''}`
    const queries: string[] = []
    await sliceByStars(TOOL_REPO_MIN_STARS, null, extra, queries)
    for (const q of queries) {
      let after: string | null = null
      do {
        const { repos, next } = await searchPage(q, after)
        for (const r of repos) out.set(r.id, r)
        after = repos.length ? next : null
      } while (after)
    }
  }
  log('skills: candidate repos', { found: out.size, incremental: !!pushedSince })
  return [...out.values()]
}

type Tree = { tree: { path: string; type: string }[]; truncated: boolean }

async function readHead(repo: string, path: string): Promise<string | null> {
  // raw.githubusercontent.com is a CDN: no API rate limit. The first 4 KB holds the frontmatter.
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { range: 'bytes=0-4095' } })
  return res.ok || res.status === 206 ? await res.text() : null
}

/** List a repo's files once and read every skill / plugin manifest in it. null = not scanned (rate limit). */
export async function scanRepo(r: RepoMeta): Promise<Found[] | null> {
  let tree: Tree | null
  try {
    tree = await restGet<Tree>(`/repos/${r.fullName}/git/trees/HEAD?recursive=1`)
  } catch (e) {
    if (e instanceof RateLimited) return null
    throw e
  }
  if (!tree) return []
  const { skills, plugins } = classifyPaths(tree.tree.filter((t) => t.type === 'blob').map((t) => t.path))
  const repoName = r.fullName.split('/')[1]
  const found: Found[] = []
  await mapLimit(skills.slice(0, MAX_SKILLS_PER_REPO), 6, async (path) => {
    const fm = parseFrontmatter((await readHead(r.fullName, path)) ?? '')
    found.push({ kind: 'skill', path, name: fm.name ?? skillDirName(path, repoName), description: fm.description })
  })
  await mapLimit(plugins.slice(0, 100), 6, async (path) => {
    let meta: { name?: string; description?: string } = {}
    try {
      meta = JSON.parse((await readHead(r.fullName, path)) ?? '{}')
    } catch {
      /* unreadable manifest: fall back to the folder name */
    }
    const dir = path.replace(/\/?\.claude-plugin\/plugin\.json$/, '')
    found.push({ kind: 'plugin', path, name: meta.name ?? (dir.split('/').pop() || repoName), description: meta.description ?? null })
  })
  if (tree.truncated) log('skills: tree truncated (very large repo), partial scan', { repo: r.fullName })
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

export const sinceDay = (iso: string) => addDays(iso.slice(0, 10), -1)
