// Shared definitions for list views. Data files are written by the pipeline (pipeline/src/write-json.ts).
import categoriesConfig from "../../config/categories.json";
import languagesConfig from "../../config/languages.json";

export const SITE_URL = "https://gitofanton.com";

export type Item = {
  id: number;
  ty: "repo";
  n: string; // owner/name
  d: string | null;
  l: string | null;
  c: string;
  t: string[];
  s: number; // total stars
  g: number; // stars gained in the window (All time: total)
  fg: number; // forks gained in the window (All time: total)
  a: string | null;
  cr: string; // created YYYY-MM-DD
  p: string | null; // last push YYYY-MM-DD
  new?: 1;
  f?: string;
};

export type View = { list: ListId; window: WindowId; category: string; lang: string | null; total: number; items: Item[] };

export type Meta = {
  generatedAt: string;
  formulaVersion: number;
  counts: Record<string, number>;
  categoryCounts: Record<string, number>;
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

export type ListId = "trending" | "rising" | "gems" | "top";

export const LISTS: Record<ListId, { title: string; noun: string; defaultWindow: WindowId; blurb: string; hasLanguages: boolean }> = {
  trending: {
    title: "Trending",
    noun: "Trending",
    defaultWindow: "today",
    blurb: "GitHub repositories gaining stars fastest, adjusted for size so a 500-star jump on a small project counts more than on a giant.",
    hasLanguages: true,
  },
  rising: {
    title: "Rising",
    noun: "Rising",
    defaultWindow: "week",
    blurb: "GitHub repositories created in the last 90 days, ranked by stars gained.",
    hasLanguages: false,
  },
  gems: {
    title: "Hidden gems",
    noun: "Hidden gem",
    defaultWindow: "week",
    blurb: "Smaller projects (50 to 2,000 stars) growing fast relative to their size, with real activity behind the stars.",
    hasLanguages: false,
  },
  top: {
    title: "Most starred",
    noun: "Most starred",
    defaultWindow: "all",
    blurb: "The most-starred GitHub repositories we track, across every category.",
    hasLanguages: false,
  },
};

/** Canonical URL path of a list view. The default view of a list lives at /{list}/. */
export function viewHref(list: ListId, window: WindowId, category = "all", lang: string | null = null) {
  if (lang) return `/${list}/${window}/lang/${lang}/`;
  if (category === "all") return window === LISTS[list].defaultWindow ? `/${list}/` : `/${list}/${window}/`;
  return `/${list}/${window}/${category}/`;
}

export const viewDataPath = (list: ListId, window: WindowId, category = "all", lang: string | null = null) =>
  lang ? `/data/lists/${list}/${window}/lang/${lang}.json` : `/data/lists/${list}/${window}/${category}.json`;

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
