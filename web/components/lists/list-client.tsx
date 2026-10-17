"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RepoCard } from "@/components/lists/repo-card";
import { langSlug, storage, windowOf, type Item, type ListId, type View, type WindowId } from "@/lib/data";

const PAGE_SIZE = 25;

export type SortId = "momentum" | "gained" | "total" | "growth" | "newest" | "updated" | "forks";

const SORTS: Record<SortId, { label: string; key: (i: Item) => number | string }> = {
  momentum: { label: "Momentum", key: (i) => i.g / Math.log10(i.s + 100) },
  gained: { label: "Stars gained", key: (i) => i.g },
  total: { label: "Total stars", key: (i) => i.s },
  growth: { label: "Growth %", key: (i) => (i.s ? i.g / i.s : 0) },
  newest: { label: "Newest", key: (i) => i.cr },
  updated: { label: "Recently updated", key: (i) => i.p ?? "" },
  forks: { label: "Forks gained", key: (i) => i.fg },
};

export function sortOptions(list: ListId, window: WindowId): SortId[] {
  if (window === "all") return ["total", "newest", "updated"];
  return [...(list === "trending" ? (["momentum"] as const) : []), "gained", "total", "growth", "newest", "updated", "forks"];
}

/** The order the pipeline wrote (the list's own ranking). */
export function defaultSort(list: ListId, window: WindowId): SortId {
  if (window === "all" || list === "top") return "total";
  return { trending: "momentum", rising: "gained", gems: "growth" }[list] as SortId;
}

function sortItems(items: Item[], sort: SortId, natural: SortId) {
  if (sort === natural) return items;
  const key = SORTS[sort].key;
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
}

const prefKey = (list: ListId) => `goa:sort:${list}`;

export function ListClient({
  list,
  window,
  initialItems,
  total,
  dataPath,
  category,
  lang,
  flaggedCount,
  asOf,
}: {
  list: ListId;
  window: WindowId;
  initialItems: Item[];
  total: number;
  dataPath: string;
  category: string;
  lang: string | null;
  flaggedCount: number;
  asOf: string;
}) {
  const natural = defaultSort(list, window);
  const options = sortOptions(list, window);
  const [full, setFull] = useState<Item[] | null>(null);
  const [sort, setSort] = useState<SortId>(natural);
  const [page, setPage] = useState(1);
  const [flagged, setFlagged] = useState<Item[] | null>(null);
  const [showFlagged, setShowFlagged] = useState(false);

  const toggleFlagged = (on: boolean) => {
    setShowFlagged(on);
    if (on && !flagged) {
      fetch("/data/flagged.json")
        .then((r) => (r.ok ? (r.json() as Promise<{ items: Item[] }>) : { items: [] }))
        .then((d) => setFlagged(d.items.filter((i) => (category === "all" || i.c === category) && (!lang || (i.l && langSlug(i.l) === lang)))))
        .catch(() => setFlagged([]));
    }
  };

  // Download the view's top 500 once; sorting and paging then need no further requests.
  // URL (?sort=&page=) and the stored sort preference are applied when it arrives.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(dataPath, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<View>) : null))
      .then((v) => {
        if (!v) return;
        setFull(v.items);
        const q = new URLSearchParams(location.search);
        const wanted = (q.get("sort") ?? storage.get(prefKey(list))) as SortId | null;
        if (wanted && options.includes(wanted)) setSort(wanted);
        const p = Number.parseInt(q.get("page") ?? "1", 10);
        if (p > 1) setPage(Math.min(p, Math.ceil(v.items.length / PAGE_SIZE)));
      })
      .catch(() => {
        /* offline or blocked: the pre-rendered first page stays usable */
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per view
  }, [dataPath]);

  const items = useMemo(() => sortItems(full ?? initialItems, sort, natural), [full, initialItems, sort, natural]);
  const totalPages = Math.max(1, Math.ceil(Math.min(full?.length ?? total, 500) / PAGE_SIZE));
  const shown = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const gainLabel = window === "all" ? null : windowOf(window).phrase;

  const syncUrl = (nextSort: SortId, nextPage: number) => {
    const q = new URLSearchParams(location.search);
    if (nextSort === natural) q.delete("sort");
    else q.set("sort", nextSort);
    if (nextPage > 1) q.set("page", String(nextPage));
    else q.delete("page");
    const qs = q.toString();
    history.replaceState(history.state, "", qs ? `?${qs}` : location.pathname);
  };

  const changeSort = (s: SortId) => {
    setSort(s);
    setPage(1);
    storage.set(prefKey(list), s);
    syncUrl(s, 1);
  };
  const goTo = (p: number) => {
    setPage(p);
    syncUrl(sort, p);
    globalThis.scrollTo({ top: 0 });
  };

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-4">
          <span className="tabular-nums">{total.toLocaleString("en-US")} repositories</span>
          {flaggedCount > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showFlagged} onChange={(e) => toggleFlagged(e.target.checked)} className="accent-foreground" />
              Show flagged
            </label>
          ) : null}
        </span>
        <label className="inline-flex items-center gap-2">
          Sort by
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortId)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {SORTS[s].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No repositories match yet. Star history started on 17 October 2026, so weekly and monthly lists fill in over the coming days.
        </p>
      ) : (
        <ol className="list-none">
          {shown.map((item, i) => (
            <li key={item.id}>
              <RepoCard item={item} rank={(page - 1) * PAGE_SIZE + i + 1} gainLabel={gainLabel} asOf={asOf} />
            </li>
          ))}
        </ol>
      )}

      {showFlagged ? (
        <section aria-label="Flagged repositories" className="mt-10">
          <h2 className="mb-1 text-lg text-foreground">Flagged</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Left out of rankings because their stars look bought or coordinated. The reason is on each card; gains are for this week.
          </p>
          {flagged === null ? (
            <p className="py-6 text-sm text-muted-foreground">Loading…</p>
          ) : flagged.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No flagged repositories in this view.</p>
          ) : (
            <ol className="list-none">
              {flagged.map((item, i) => (
                <li key={item.id}>
                  <RepoCard item={item} rank={i + 1} gainLabel="this week" asOf={asOf} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages || !full}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      ) : null}
    </>
  );
}
