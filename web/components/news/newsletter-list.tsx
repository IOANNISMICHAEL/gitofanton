"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { News } from "@/lib/server-data";

/** Newsletter posts (title, source, date, link), filterable by source. Pre-rendered; the filter is the only script. */
export function NewsletterList({ news }: { news: News }) {
  const [source, setSource] = useState<string | null>(null);
  const name = (id: string) => news.sources.find((s) => s.id === id)?.name ?? id;
  const items = news.items.filter((i) => !source || i.s === source).slice(0, 40);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[{ id: null as string | null, name: "All" }, ...news.sources].map((s) => (
          <button
            key={s.id ?? "all"}
            type="button"
            onClick={() => setSource(s.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              source === s.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.u}>
            <a href={i.u} target="_blank" rel="noopener" className="block py-3 hover:text-foreground">
              <span className="block text-foreground">{i.t}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {name(i.s)} · {i.d.slice(0, 10)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
