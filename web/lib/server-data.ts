// Build-time access to the pipeline's JSON (web/public/data). Server components only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ListId, Meta, View, WindowId } from "@/lib/data";

const DATA_DIR = join(process.cwd(), "public", "data");

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, rel), "utf8")) as T;
  } catch {
    return null; // no data yet (e.g. a local build before the pipeline ran): render empty states
  }
}

export function readView(list: ListId, window: WindowId, category = "all", lang: string | null = null): View {
  const rel = lang ? `lists/${list}/${window}/lang/${lang}.json` : `lists/${list}/${window}/${category}.json`;
  return readJson<View>(rel) ?? { list, window, category, lang, total: 0, items: [] };
}

export const readMeta = () => readJson<Meta>("meta.json");
