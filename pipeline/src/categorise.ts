// Category rules (PLAN 6.5): ordered rules, first match wins — topics, then description keywords, then language.
import { readFileSync } from 'node:fs'
import { CATEGORIES, type Category } from './config.ts'

type Rule = { id: Category; topics: string[]; keywords: string[]; languages: string[] }
/** trusted: clears a fake-star flag the owner has reviewed and rejected. */
export type Override = { category?: Category; hidden?: boolean; trusted?: boolean }

const root = new URL('../../config/', import.meta.url)

export function loadRules(): Rule[] {
  const { rules } = JSON.parse(readFileSync(new URL('categories.json', root), 'utf8')) as { rules: Rule[] }
  for (const r of rules) if (!CATEGORIES.includes(r.id)) throw new Error(`categories.json: unknown category ${r.id}`)
  return rules
}

export function loadOverrides(): Record<string, Override> {
  return JSON.parse(readFileSync(new URL('overrides.json', root), 'utf8')) as Record<string, Override>
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function makeCategoriser(rules: Rule[]) {
  const compiled = rules.map((r) => ({
    id: r.id,
    topics: new Set(r.topics),
    keyword: r.keywords.length ? new RegExp(`(?<![\\w-])(?:${r.keywords.map(escape).join('|')})(?![\\w-])`, 'i') : null,
    languages: new Set(r.languages),
  }))
  return (repo: { topics: string[]; description: string | null; language: string | null }): Category => {
    for (const r of compiled) if (repo.topics.some((t) => r.topics.has(t))) return r.id
    if (repo.description) for (const r of compiled) if (r.keyword?.test(repo.description)) return r.id
    if (repo.language) for (const r of compiled) if (r.languages.has(repo.language)) return r.id
    return 'other'
  }
}
