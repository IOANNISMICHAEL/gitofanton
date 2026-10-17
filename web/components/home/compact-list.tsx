import Link from "next/link";
import { ArrowRight, Download, Star } from "lucide-react";
import { TYPE_LABEL, categoryLabel, formatStars, type Item } from "@/lib/data";

/** A short ranked list for front-page and category panels. */
export function CompactList({
  title,
  subtitle,
  href,
  items,
  gainLabel,
  showCategory = true,
  empty = "Fills in as star history builds up.",
}: {
  title: string;
  subtitle?: string;
  href: string;
  items: Item[];
  gainLabel: string | null;
  showCategory?: boolean;
  empty?: string;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium text-foreground">{title}</h2>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          See all <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {subtitle ? <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p> : null}
      {items.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="list-none divide-y divide-border">
          {items.map((it, i) => {
            const isTool = it.ty !== "repo";
            const url = isTool ? (it.u ?? (it.rp ? `https://github.com/${it.rp}` : null)) : `https://github.com/${it.n}`;
            return (
              <li key={it.id} className="relative flex items-center gap-3 py-2.5">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                {it.a ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.a} alt="" width={28} height={28} loading="lazy" className="size-7 shrink-0 rounded border border-border bg-muted" />
                ) : (
                  <div className="size-7 shrink-0 rounded border border-border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-foreground hover:underline after:absolute after:inset-0 after:content-['']">
                      {it.n}
                    </a>
                  ) : (
                    <span className="block truncate text-sm text-foreground">{it.n}</span>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">
                    {isTool ? `${TYPE_LABEL[it.ty]}${it.rp ? ` · ${it.rp}` : ""}` : showCategory ? categoryLabel(it.c) : (it.d ?? "")}
                  </span>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  {it.s > 0 ? (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Star className="size-3" aria-hidden />
                      {formatStars(it.s)}
                    </span>
                  ) : it.dl != null ? (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Download className="size-3" aria-hidden />
                      {formatStars(it.dl)}/wk
                    </span>
                  ) : null}
                  {gainLabel && it.g > 0 ? (
                    <span className="block font-mono text-emerald-700 dark:text-emerald-400">+{formatStars(it.g)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
