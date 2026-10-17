// Embedding classifier for categories (PLAN v2 §1): a small open model (all-MiniLM-L6-v2, ~23 MB,
// pinned revision) compares an item's description with each category's `about` text in
// config/categories.json. Free: runs inside the GitHub Actions job.
//
// Built to never break the pipeline: if the model can't load, classify() returns null for everything
// and callers fall back to the keyword rules.
import { readFileSync } from 'node:fs'
import { CATEGORIES, type Category } from './config.ts'
import { log } from './util.ts'

const MODEL = 'Xenova/all-MiniLM-L6-v2'
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9' // pinned: the model never changes under us
export const CLASSIFIER_VERSION = 1 // bump when the model, `about` texts or thresholds change: items get re-classified
export const MIN_SIMILARITY = 0.25 // below this the item matches no category well
export const MIN_MARGIN = 0.015 // best must beat the runner-up by this much, else "unsure"

type Embedder = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
export type Classifier = (texts: string[]) => Promise<(Category | null)[]>

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

/** Pure decision step (tested): best category by cosine similarity, or null when not confident. */
export function decide(vec: number[], prototypes: [Category, number[]][]): Category | null {
  let best: Category | null = null
  let bestSim = -1
  let second = -1
  for (const [id, p] of prototypes) {
    const s = dot(vec, p)
    if (s > bestSim) {
      second = bestSim
      bestSim = s
      best = id
    } else if (s > second) second = s
  }
  return best && bestSim >= MIN_SIMILARITY && bestSim - second >= MIN_MARGIN ? best : null
}

export async function loadClassifier(cacheDir: string): Promise<Classifier> {
  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = cacheDir
    const embed = (await pipeline('feature-extraction', MODEL, { revision: REVISION, dtype: 'q8' })) as unknown as Embedder
    const { categories } = JSON.parse(readFileSync(new URL('../../config/categories.json', import.meta.url), 'utf8')) as {
      categories: { id: Category; label: string; about: string }[]
    }
    const usable = categories.filter((c) => c.id !== 'other' && CATEGORIES.includes(c.id))
    const protoVecs = (await embed(usable.map((c) => `${c.label}: ${c.about}`), { pooling: 'mean', normalize: true })).tolist()
    const prototypes = usable.map((c, i) => [c.id, protoVecs[i]] as [Category, number[]])
    log('classifier: loaded', { model: MODEL, categories: prototypes.length })
    return async (texts) => {
      const out: (Category | null)[] = []
      for (let i = 0; i < texts.length; i += 128) {
        const vecs = (await embed(texts.slice(i, i + 128).map((t) => t || ' '), { pooling: 'mean', normalize: true })).tolist()
        for (const v of vecs) out.push(decide(v, prototypes))
      }
      return out
    }
  } catch (e) {
    log('classifier: unavailable, using keyword rules only', { error: String(e).slice(0, 300) })
    return async (texts) => texts.map(() => null)
  }
}
