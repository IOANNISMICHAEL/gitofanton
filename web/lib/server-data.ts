// Build-time access to the pipeline's JSON (web/public/data). Server components only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { viewDataPath, type ListId, type Meta, type View, type WindowId } from "@/lib/data";

const DATA_DIR = join(process.cwd(), "public", "data");

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, rel), "utf8")) as T;
  } catch {
    return null; // no data yet (e.g. a local build before the pipeline ran): render empty states
  }
}

export function readView(list: ListId, window: WindowId | null, category = "all", lang: string | null = null): View {
  return readJson<View>(viewDataPath(list, window, category, lang).replace(/^\/data\//, "")) ?? { list, window, category, lang, total: 0, items: [] };
}

export const readMeta = () => readJson<Meta>("meta.json");
export const readToolboxMeta = () => readJson<{ counts: Record<string, number>; byCategory: Record<string, number> }>("toolbox/meta.json");
