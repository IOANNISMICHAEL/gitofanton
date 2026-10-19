// Role kits (PLAN v2 M12): editorial picks in config/kits/*.json, checked against the latest item data
// on every build, so a pick that vanished, got flagged or went quiet is marked on the page.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { allPages, installCommand, pagesGeneratedAt, type PageData } from "@/lib/items";

export type Role = "skill" | "mcp" | "agent";
export type Pick = {
  role: Role;
  page?: string; // item page path, e.g. "repo/owner/name"
  url?: string; // external source when we have no page for it
  name: string;
  install?: { label: string; cmd: string; then?: string[] };
  why: string;
};
export type Kit = { slug: string; title: string; intro: string; reviewed: string; tasks: { task: string; picks: Pick[] }[] };

export const ROLE_LABEL: Record<Role, string> = { skill: "Skill", mcp: "MCP server", agent: "Agent" };
const STALE_DAYS = 90;

const DIR = join(process.cwd(), "..", "config", "kits");

export function allKits(): Kit[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Kit)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const getKit = (slug: string) => allKits().find((k) => k.slug === slug) ?? null;

export type Checked = Pick & {
  data: PageData | null;
  href: string | null; // our item page or the external source
  status: { label: string; bad: boolean } | null;
  cmd: { label: string; cmd: string; then?: string[] } | null;
};

/** Live state of a pick from this build's item data. */
export function check(p: Pick): Checked {
  const byPath = new Map(allPages().map((x) => [x.p, x]));
  const data = p.page ? (byPath.get(p.page) ?? null) : null;
  const asOf = Date.parse(pagesGeneratedAt());
  let status: Checked["status"] = null;
  if (p.page && !data && allPages().length) status = { label: "No longer in our data", bad: true };
  else if (data?.flag) status = { label: `Flagged: ${data.flag}`, bad: true };
  else if (data?.arch) status = { label: "Archived", bad: true };
  else if (data?.pu && asOf - Date.parse(data.pu) > STALE_DAYS * 86_400_000) status = { label: `No commits since ${data.pu}`, bad: true };
  const auto = data ? installCommand(data) : null;
  return {
    ...p,
    data,
    href: data ? `/${data.p}/` : (p.url ?? null),
    status,
    cmd: p.install ?? (auto && data?.k !== "repo" ? auto : null),
  };
}
