"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Hit = { objectID: string; title: string; url: string | null; points: number; num_comments: number; created_at_i: number };
const TABS = [
  { id: "front_page", label: "Front page" },
  { id: "show_hn", label: "Show HN" },
] as const;

const ago = (s: number) => {
  const m = Math.max(1, Math.round((Date.now() / 1000 - s) / 60));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** Live Hacker News from the public Algolia API. Every story opens its HN discussion page. */
export function HnLive() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("front_page");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const q = tab === "front_page" ? "search?tags=front_page&hitsPerPage=30" : "search_by_date?tags=show_hn&numericFilters=points%3E10&hitsPerPage=30";
    fetch(`https://hn.algolia.com/api/v1/${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ hits: Hit[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setHits(d.hits.filter((h) => h.title));
        setFailed(false);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [tab]);

  const pick = (id: (typeof TABS)[number]["id"]) => {
    setHits(null);
    setTab(id);
  };

  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-border p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            className={cn("rounded-[3px] px-3 py-1.5 text-sm", t.id === tab ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="py-6 text-sm text-muted-foreground">
          Hacker News did not answer. <a href="https://news.ycombinator.com/" className="text-foreground underline">Open it directly</a>.
        </p>
      ) : !hits ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ol className="divide-y divide-border">
          {hits.map((h, i) => {
            const host = h.url ? new URL(h.url).hostname.replace(/^www\./, "") : null;
            return (
              <li key={h.objectID}>
                <a href={`https://news.ycombinator.com/item?id=${h.objectID}`} target="_blank" rel="noopener" className="flex gap-3 py-3 hover:text-foreground">
                  <span className="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-foreground">{h.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {h.points} points · {h.num_comments} comments · {ago(h.created_at_i)}
                      {host ? ` · ${host}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
