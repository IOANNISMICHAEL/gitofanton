// Shared definitions for list views. Data files are written by the pipeline (pipeline/src/write-json.ts).
import categoriesConfig from "../../config/categories.json";
import languagesConfig from "../../config/languages.json";

export const SITE_URL = "https://gitofanton.com";

export type ItemType = "repo" | "skill" | "mcp" | "agent" | "plugin";

/** One row of a list view. Repo items: n = owner/name. Toolbox items add rp/u/dl/pk/rm. */
export type Item = {
  id: number;
  ty: ItemType;
  n: string; // owner/name for repos; the item's own name for toolbox items
  rp?: string | null; // toolbox: GitHub repo behind it
  u?: string | null; // toolbox: where to open it
  dl?: number | null; // toolbox: weekly package downloads
  pk?: string; // toolbox: package name
  rm?: 1; // MCP: hosted endpoint
  d: string | null;
  l?: string | null; // repos only
  c: string;
  t?: string[]; // repos only
  s: number; // total stars
  g: number; // stars gained in the window (All time: total)
  fg: number; // forks gained in the window (All time: total)
  a: string | null;
  cr: string; // created YYYY-MM-DD
  p: string | null; // last push YYYY-MM-DD
  new?: 1;
  f?: string;
  ip?: string; // our item page, when the item has one
};

/** Props for a link that opens our own page in place and anything else in a new tab. */
export const linkProps = (url: string) =>
  url.startsWith("/") ? { href: url } : { href: url, target: "_blank", rel: "noopener noreferrer" };

export type View = { list: ListId; window: WindowId | null; category: string; lang: string | null; total: number; items: Item[] };

export type Meta = {
  generatedAt: string;
  formulaVersion: number;
  counts: Record<string, number>;
  categoryCounts: Record<string, number>;
  toolbox?: { byType: Record<string, { total: number; withRepo: number; withPackage: number }>; withDownloads: number };
  starsToday?: number;
  trendingTopics?: string[];
  languages: { name: string; slug: string }[];
  trackedRepos: number;
  historyDays: number;
  historyAsOf: string | null;
};

export const CATEGORIES: { id: string; label: string }[] = categoriesConfig.categories;
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
export const isCategory = (id: string) => CATEGORIES.some((c) => c.id === id);

/** Language URL slug; must match pipeline/src/write-json.ts. */
export const langSlug = (s: string) =>
  s.toLowerCase().replace(/\+/g, "p").replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const LANGUAGES = languagesConfig.languages.map((name) => ({ name, slug: langSlug(name) }));
export const languageName = (slug: string) => LANGUAGES.find((l) => l.slug === slug)?.name ?? slug;

export const WINDOWS = [
  { id: "today", label: "Today", phrase: "today" },
  { id: "week", label: "This week", phrase: "this week" },
  { id: "month", label: "This month", phrase: "this month" },
  { id: "all", label: "All time", phrase: "of all time" },
] as const;
export type WindowId = (typeof WINDOWS)[number]["id"];
export const isWindow = (w: string): w is WindowId => WINDOWS.some((x) => x.id === w);
export const windowOf = (w: WindowId) => WINDOWS.find((x) => x.id === w)!;

export type ListId = "trending" | "rising" | "gems" | "skills" | "mcp" | "agents";
export type ToolListId = "skills" | "mcp" | "agents";

/** Toolbox pages: the sort is the only menu, and each sort is its own page (pipeline/src/toolbox.ts). */
export const TOOL_SORTS = [
  { id: "trending", label: "Trending", blurb: "Ranked by how fast the GitHub repo behind each one grew this week, adjusted for size." },
  { id: "stars", label: "Most stars", blurb: "Ranked by the stars of the GitHub repo behind each one." },
  { id: "downloads", label: "Most downloaded", blurb: "Ranked by weekly npm and PyPI downloads." },
  { id: "newest", label: "Newest", blurb: "Most recently published first." },
  { id: "updated", label: "Recently updated", blurb: "Most recently updated repo first." },
] as const;
export type ToolSortId = (typeof TOOL_SORTS)[number]["id"];
export const toolSortsFor = (list: ListId) => TOOL_SORTS.filter((s) => s.id !== "downloads" || list === "mcp");
export const toolSortOf = (id: ToolSortId) => TOOL_SORTS.find((s) => s.id === id)!;
export const toolHref = (list: ListId, sort: ToolSortId = "trending") => `${LISTS[list].base}/${sort === "trending" ? "" : `${sort}/`}`;
export const toolDataPath = (list: ListId, sort: ToolSortId = "trending") => `/data/toolbox/${list}/${sort}.json`;
export const toolCategoryDataPath = (list: ListId, category: string) => `/data/toolbox/${list}/category/${category}.json`;

type ListDef = {
  title: string;
  noun: string; // what one list holds, plural, for counts and titles
  /** Time tabs this list has (null = a single list, no tabs). The first is the default. */
  windows: WindowId[] | null;
  defaultWindow: WindowId | null;
  blurb: string;
  hasLanguages: boolean;
  base: string; // URL path of the list
  section: "GitHub" | "Toolbox";
  hasDownloads?: boolean;
};

export const LISTS: Record<ListId, ListDef> = {
  trending: {
    title: "Trending",
    noun: "Trending",
    windows: ["today", "week", "month", "all"],
    defaultWindow: "today",
    blurb: "GitHub repositories gaining stars fastest, adjusted for size so a 500-star jump on a small project counts more than on a giant.",
    hasLanguages: true,
    base: "/trending",
    section: "GitHub",
  },
  rising: {
    title: "Rising",
    noun: "Rising",
    windows: null,
    defaultWindow: null,
    blurb: "New GitHub repositories (created in the last 90 days), ranked by stars gained this week.",
    hasLanguages: false,
    base: "/rising",
    section: "GitHub",
  },
  gems: {
    title: "Hidden gems",
    noun: "Hidden gem",
    windows: null,
    defaultWindow: null,
    blurb: "Smaller projects (50 to 2,000 stars) growing fast relative to their size, with real activity behind the stars.",
    hasLanguages: false,
    base: "/gems",
    section: "GitHub",
  },
  skills: {
    title: "Agent skills",
    noun: "skills",
    windows: null,
    defaultWindow: null,
    blurb: "Agent Skills (SKILL.md) from GitHub, from GitHub, at most three per repo.",
    hasLanguages: false,
    base: "/toolbox/skills",
    section: "Toolbox",
  },
  mcp: {
    title: "MCP servers",
    noun: "MCP servers",
    windows: null,
    defaultWindow: null,
    blurb: "Model Context Protocol servers from the official MCP Registry, with their GitHub repos and weekly npm and PyPI downloads.",
    hasLanguages: false,
    base: "/toolbox/mcp",
    section: "Toolbox",
    hasDownloads: true,
  },
  agents: {
    title: "Agents & plugins",
    noun: "agents and plugins",
    windows: null,
    defaultWindow: null,
    blurb: "Coding agents and Claude Code plugins from GitHub.",
    hasLanguages: false,
    base: "/toolbox/agents",
    section: "Toolbox",
  },
};

export const isToolList = (list: ListId) => LISTS[list].section === "Toolbox";

/** Canonical URL path of a list view. The default view of a list lives at /{list}/. */
/** Canonical URL of a view. Lists without time tabs: /{list}/[{category}/]. Default window: /{list}/. */
export function viewHref(list: ListId, window: WindowId | null, category = "all", lang: string | null = null) {
  const base = LISTS[list].base;
  if (isToolList(list)) return `${base}/`;
  if (!window) return category === "all" ? `${base}/` : `${base}/${category}/`;
  if (lang) return `${base}/${window}/lang/${lang}/`;
  if (category === "all") return window === LISTS[list].defaultWindow ? `${base}/` : `${base}/${window}/`;
  return `${base}/${window}/${category}/`;
}

export function viewDataPath(list: ListId, window: WindowId | null, category = "all", lang: string | null = null) {
  if (isToolList(list)) return category === "all" ? toolDataPath(list) : toolCategoryDataPath(list, category);
  if (!window) return `/data/lists/${list}/${category}.json`;
  return lang ? `/data/lists/${list}/${window}/lang/${lang}.json` : `/data/lists/${list}/${window}/${category}.json`;
}

/** data/radar/{category}.json (pipeline/src/radar.ts). q = quadrant index; ring 0 = most stars. */
export type RadarItem = { n: string; ty: ItemType; q: number; c: string; s: number; g: number; u: string; a: string | null; ring: number };
export type Radar = { category: string; quadrants: string[]; rings: { label: string; min: number; max: number }[]; items: RadarItem[] };
export const RADAR_CATEGORIES = () => CATEGORIES.filter((c) => c.id !== "other");

export const TYPE_LABEL: Record<ItemType, string> = { repo: "Repo", skill: "Skill", mcp: "MCP server", agent: "Agent", plugin: "Plugin" };

export function formatStars(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
}

// GitHub linguist colours for the common languages; everything else gets a neutral dot.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", Rust: "#dea584", Go: "#00ADD8",
  Java: "#b07219", Kotlin: "#A97BFF", Swift: "#F05138", "C++": "#f34b7d", C: "#555555", "C#": "#178600",
  Ruby: "#701516", PHP: "#4F5D95", Shell: "#89e051", Dart: "#00B4AB", Zig: "#ec915c", Lua: "#000080",
  HTML: "#e34c26", CSS: "#563d7c", Vue: "#41b883", Svelte: "#ff3e00", "Jupyter Notebook": "#DA5B0B",
  Elixir: "#6e4a7e", Haskell: "#5e5086", Scala: "#c22d40", Nix: "#7e7eff",
};
export const languageColor = (l: string | null) => (l && LANGUAGE_COLORS[l]) || "#8b8b8b";

/** localStorage that never throws (private mode, blocked storage, SSR). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: preferences just aren't remembered */
    }
  },
};
