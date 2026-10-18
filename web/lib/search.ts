// Client side of the search index written by pipeline/src/search.ts.
import type { ItemType } from "@/lib/data";

export type SearchRow = [name: string, type: ItemType, stars: number, category: string, url: string, repo: string | null];

/** Same word split as the pipeline: separators and camelCase, lower-cased. */
export function words(name: string): string[] {
  const out = new Set<string>();
  for (const p of name.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
    out.add(p.toLowerCase());
    for (const w of p.split(/(?<=[a-z0-9])(?=[A-Z])/)) out.add(w.toLowerCase());
  }
  return [...out];
}

let indexPromise: Promise<{ names: number; split: string[] }> | null = null;
const shards = new Map<string, Promise<SearchRow[]>>();

const getIndex = () =>
  (indexPromise ??= fetch("/data/search/index.json")
    .then((r) => (r.ok ? r.json() : { names: 0, split: [] }))
    .catch(() => ({ names: 0, split: [] })));

function getShard(key: string) {
  let p = shards.get(key);
  if (!p) {
    p = fetch(`/data/search/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SearchRow[]>) : []))
      .catch(() => []);
    shards.set(key, p);
  }
  return p;
}

/** Up to `limit` matches: the first query word starts a word of the name, the others appear anywhere. */
export async function search(query: string, limit = 20): Promise<SearchRow[]> {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const first = q[0];
  if (!first || first.length < 2) return [];
  const { split } = await getIndex();
  const key = first.length >= 3 && split.includes(first.slice(0, 2)) ? first.slice(0, 3) : first.slice(0, 2);
  const rows = await getShard(key);
  const rest = q.slice(1);
  const out: SearchRow[] = [];
  for (const row of rows) {
    const ws = [...words(row[0]), ...(row[5] ? words(row[5]) : [])];
    if (!ws.some((w) => w.startsWith(first))) continue;
    const hay = `${row[0]} ${row[5] ?? ""}`.toLowerCase();
    if (rest.some((r) => !hay.includes(r))) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** Warm the index so the first keystroke only waits for one shard. */
export const preloadSearch = () => void getIndex();
