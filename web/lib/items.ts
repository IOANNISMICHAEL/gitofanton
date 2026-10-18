// Build-time access to item page data (pipeline/src/items.ts writes web/.item-data/pages.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PageKind = "repo" | "skill" | "mcp" | "agent" | "plugin";
export type Ref = { p: string; n: string; k: PageKind; s: number; g: number };
export type PageData = {
  p: string;
  k: PageKind;
  n: string;
  d: string | null;
  c: string;
  repo: string | null;
  u: string;
  s: number;
  g: { today: number; week: number; month: number; all: number };
  f: number;
  l: string | null;
  lic: string | null;
  home: string | null;
  t: string[];
  a: string | null;
  cr: string | null;
  pu: string | null;
  seen: string | null;
  arch: 0 | 1;
  flag: string | null;
  dl: number | null;
  pk: string | null;
  reg: string | null;
  rm: 0 | 1;
  path: string | null;
  hist: [string, number][];
  same: Ref[];
  similar: Ref[];
};

/** Shown when a build has no pipeline data (CI's no-data build): one placeholder page per route. */
export const PLACEHOLDER = "_";

let cache: { generatedAt: string; pages: PageData[]; byPath: Map<string, PageData> } | null = null;

function load() {
  if (cache) return cache;
  try {
    const j = JSON.parse(readFileSync(join(process.cwd(), ".item-data", "pages.json"), "utf8")) as { generatedAt: string; pages: PageData[] };
    cache = { ...j, byPath: new Map(j.pages.map((p) => [p.p, p])) };
  } catch {
    cache = { generatedAt: new Date(0).toISOString(), pages: [], byPath: new Map() };
  }
  return cache;
}

export const allPages = () => load().pages;
export const pagesGeneratedAt = () => load().generatedAt;

/** generateStaticParams for one kind: { path: ["owner", "name", ...] }. */
export function pageParams(kind: PageKind) {
  const ps = load().pages.filter((p) => p.k === kind).map((p) => ({ path: p.p.split("/").slice(1) }));
  return ps.length ? ps : [{ path: [PLACEHOLDER] }];
}

export function getPage(kind: PageKind, path: string[]) {
  return load().byPath.get([kind, ...path.map((s) => decodeURIComponent(s))].join("/")) ?? null;
}

export const KIND_LABEL: Record<PageKind, string> = { repo: "Repository", skill: "Agent skill", mcp: "MCP server", agent: "Agent", plugin: "Claude Code plugin" };

/** One copy-paste command to install or try the item, when we know it reliably. */
export function installCommand(p: PageData): { label: string; cmd: string } | null {
  const last = (s: string) => s.split("/").pop() ?? s;
  if (p.k === "mcp" && p.pk) {
    const name = last(p.n).replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase();
    if (p.reg === "npm") return { label: "Add to Claude Code", cmd: `claude mcp add ${name} -- npx -y ${p.pk}` };
    if (p.reg === "pypi") return { label: "Add to Claude Code", cmd: `claude mcp add ${name} -- uvx ${p.pk}` };
    if (p.reg === "oci") return { label: "Add to Claude Code", cmd: `claude mcp add ${name} -- docker run -i --rm ${p.pk}` };
    return null;
  }
  if (p.k === "skill" && p.repo && p.path) {
    const dir = p.path.replace(/\/?SKILL\.md$/i, "");
    const name = last(p.p);
    return { label: "Install for Claude Code", cmd: `npx degit ${p.repo}${dir ? `/${dir}` : ""} ~/.claude/skills/${name}` };
  }
  if (p.k === "plugin" && p.repo) return { label: "In Claude Code", cmd: `/plugin marketplace add ${p.repo}` };
  if (p.k === "repo" && p.repo) return { label: "Clone", cmd: `git clone https://github.com/${p.repo}.git` };
  return null;
}
