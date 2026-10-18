// Keep the last good data (owner, 2026-10-18): "first fetch, then populate; if something isn't
// fetched, leave the old ones and send me a notice."
//
// Runs after the pipeline wrote web/public/data and before the site build. Compares every list file
// with the copy from the last deployed run (kept in the Actions cache) and puts the old file back when
// the new one came out empty or collapsed. Writes a notice for the workflow to open as a GitHub issue,
// which GitHub emails to the owner.
//
//   node pipeline/src/keep-good.ts <new data dir> <last-good dir> <notice file>
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/** A list shrinking below this share of its previous size counts as a failed fetch. */
export const COLLAPSE_SHARE = 0.3
/** Lists smaller than this before are too small for the collapse rule (only "came out empty" applies). */
export const COLLAPSE_MIN_BEFORE = 30

type ListFile = { total: number; items: unknown[] }

function readList(path: string): ListFile | null {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8')) as Partial<ListFile>
    return typeof j.total === 'number' && Array.isArray(j.items) ? (j as ListFile) : null
  } catch {
    return null
  }
}

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.json') ? [p] : []
  })
}

/** Why the new list should be replaced by the old one, or null to keep the new one. */
export function failure(before: ListFile, after: ListFile | null): string | null {
  if (!after) return 'missing'
  if (before.items.length > 0 && after.items.length === 0) return `empty (was ${before.total})`
  if (before.total >= COLLAPSE_MIN_BEFORE && after.total < before.total * COLLAPSE_SHARE) return `dropped from ${before.total} to ${after.total}`
  return null
}

export function keepGood(newDir: string, goodDir: string) {
  const restored: { file: string; why: string }[] = []
  for (const old of files(goodDir)) {
    const rel = relative(goodDir, old)
    const before = readList(old)
    if (!before) continue // meta.json, radar.json: always the new run's
    const target = join(newDir, rel)
    // A whole folder gone means the list itself was removed or renamed in code: don't bring it back.
    if (!existsSync(dirname(target))) continue
    const why = failure(before, readList(target))
    if (!why) continue
    cpSync(old, target)
    restored.push({ file: rel, why })
  }
  return restored
}

/** Groups restored files by list, e.g. "lists/trending/today" or "toolbox/skills". */
export function notice(restored: { file: string; why: string }[], runUrl: string) {
  const groups = new Map<string, string[]>()
  for (const r of restored) {
    const key = dirname(r.file)
    groups.set(key, [...(groups.get(key) ?? []), `${r.file.split('/').pop()!.replace('.json', '')}: ${r.why}`])
  }
  const lines = [...groups.entries()].map(([g, xs]) => `- **${g}** (${xs.length}): ${xs.slice(0, 6).join('; ')}${xs.length > 6 ? '; …' : ''}`)
  return [
    `The latest data run could not refresh ${restored.length} list file(s), so the site kept showing the previous version of them.`,
    '',
    ...lines,
    '',
    `Run: ${runUrl}`,
    '',
    'Nothing to do if this clears on the next run (every 4 hours); this issue then closes itself.',
  ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [newDir, goodDir, noticeFile] = process.argv.slice(2)
  if (!newDir || !goodDir || !noticeFile) throw new Error('usage: keep-good.ts <new data dir> <last-good dir> <notice file>')
  const restored = existsSync(goodDir) ? keepGood(newDir, goodDir) : []
  if (!existsSync(goodDir)) console.log('keep-good: no previous data in the cache (first run); nothing to compare')
  const run = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? ''}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`
  rmSync(noticeFile, { force: true })
  if (restored.length) {
    writeFileSync(noticeFile, notice(restored, run))
    for (const r of restored) console.log(`::warning::kept old ${r.file}: ${r.why}`)
  }
  console.log(`keep-good: ${restored.length} file(s) kept from the last good run`)
  // The merged result is the next run's baseline.
  rmSync(goodDir, { recursive: true, force: true })
  mkdirSync(dirname(goodDir), { recursive: true })
  cpSync(newDir, goodDir, { recursive: true })
}
