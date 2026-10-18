// Build-time access to the pipeline's JSON (web/public/data). Server components only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toolCategoryDataPath, toolDataPath, viewDataPath, type ListId, type Meta, type Radar, type ToolSortId, type View, type WindowId } from "@/lib/data";

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

/** A toolbox list in one sort order, or the first items of one category (category pages). */
export function readToolView(list: ListId, sort: ToolSortId = "trending", category = "all"): View {
  const rel = (category === "all" ? toolDataPath(list, sort) : toolCategoryDataPath(list, category)).replace(/^\/data\//, "");
  return readJson<View>(rel) ?? { list, window: null, category, lang: null, total: 0, items: [] };
}

export const readRadar = (category: string) => readJson<Radar>(`radar/${category}.json`);

export const readMeta = () => readJson<Meta>("meta.json");
export const readToolboxMeta = () => readJson<{ counts: Record<string, number>; byCategory: Record<string, number> }>("toolbox/meta.json");
