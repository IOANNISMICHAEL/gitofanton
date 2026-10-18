"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SearchResults } from "@/components/search/search-results";
import { preloadSearch, search, type SearchRow } from "@/lib/search";

/** ⌘K / Ctrl+K / "/" search over repos, skills, MCP servers and agents. */
export function SearchDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) preloadSearch();
  }, [open]);

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      void search(q).then((r) => {
        if (n !== seq.current) return; // a newer query won
        setRows(r);
        setActive(0);
      });
    }, 80);
    return () => clearTimeout(t);
  }, [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) window.open(rows[active][4], "_blank", "noopener");
      else if (q.trim()) location.href = `/search/?q=${encodeURIComponent(q.trim())}`;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={preloadSearch}
        aria-label="Search"
        className={
          compact
            ? "p-2 text-foreground"
            : "inline-flex items-center gap-2 rounded-full border border-foreground/15 px-3 py-1.5 text-sm text-foreground/70 transition-colors hover:border-foreground/40 hover:text-foreground"
        }
      >
        <Search className={compact ? "size-5" : "size-4"} aria-hidden />
        {compact ? null : (
          <>
            Search
            <kbd className="rounded border border-foreground/15 px-1.5 font-mono text-[11px] text-muted-foreground">⌘K</kbd>
          </>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search repos, skills, MCP servers, agents…"
              aria-label="Search"
              className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {q.trim().length < 2 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Type at least two letters. Matches the start of any word in a name.</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No matches in the top 50,000 names.</p>
            ) : (
              <SearchResults rows={rows} active={active} onHover={setActive} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
