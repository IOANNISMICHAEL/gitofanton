"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchResults } from "@/components/search/search-results";
import { search, type SearchRow } from "@/lib/search";

/** /search/?q=… (the home page's SearchAction target): the same search, as a page. */
export function SearchPageClient() {
  const [q, setQ] = useState(useSearchParams().get("q") ?? "");
  const [rows, setRows] = useState<SearchRow[] | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void search(q, 50).then((r) => live && setRows(r));
      if (live) setRows(null); // "Searching…" until this query's rows arrive
      history.replaceState(history.state, "", q.trim() ? `?q=${encodeURIComponent(q.trim())}` : location.pathname);
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search repos, skills, MCP servers, agents…"
        aria-label="Search"
        className="mb-6 h-14 w-full rounded-md border border-border bg-transparent px-4 text-lg text-foreground outline-none focus:border-foreground/50"
      />
      {q.trim().length < 2 ? (
        <p className="text-muted-foreground">Type at least two letters.</p>
      ) : rows && rows.length === 0 ? (
        <p className="text-muted-foreground">No matches in the top 50,000 names.</p>
      ) : rows ? (
        <div className="neon">
          <SearchResults rows={rows} active={-1} />
        </div>
      ) : (
        <p className="text-muted-foreground">Searching…</p>
      )}
    </>
  );
}
