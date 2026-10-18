import { Star } from "lucide-react";
import { TYPE_LABEL, categoryLabel, formatStars } from "@/lib/data";
import type { SearchRow } from "@/lib/search";
import { cn } from "@/lib/utils";

export function SearchResults({ rows, active, onHover }: { rows: SearchRow[]; active: number; onHover?: (i: number) => void }) {
  return (
    <ul role="listbox" className="divide-y divide-border">
      {rows.map((r, i) => (
        <li key={`${r[1]}-${r[4]}`} role="option" aria-selected={i === active}>
          <a
            href={r[4]}
            target="_blank"
            rel="noopener"
            onMouseEnter={() => onHover?.(i)}
            className={cn("flex items-center gap-3 px-4 py-3 transition-colors", i === active ? "bg-foreground/10" : "hover:bg-foreground/5")}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">{r[0]}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {TYPE_LABEL[r[1]]} · {categoryLabel(r[3])}
                {r[5] && r[5] !== r[0] ? ` · ${r[5]}` : ""}
              </span>
            </span>
            {r[2] > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                <Star className="size-3" aria-hidden /> {formatStars(r[2])}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
