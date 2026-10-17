import { Clock, Download, Globe, Star, TriangleAlert } from "lucide-react";
import { TYPE_LABEL, categoryLabel, formatStars, languageColor, type Item } from "@/lib/data";

const STALE_DAYS = 90;

/** asOf: the data's timestamp, so server and browser render the same badge. */
export function RepoCard({ item, rank, gainLabel, asOf }: { item: Item; rank: number; gainLabel: string | null; asOf: string }) {
  const isTool = item.ty !== "repo";
  const [owner, name] = isTool ? [null, item.n] : item.n.split("/");
  const stale = !!item.p && Date.parse(asOf) - Date.parse(item.p) > STALE_DAYS * 86_400_000;
  const url = isTool ? (item.u ?? (item.rp ? `https://github.com/${item.rp}` : null)) : `https://github.com/${item.n}`;

  return (
    <article className="group relative flex gap-4 border-b border-border py-5">
      <span className="w-6 shrink-0 pt-1 text-right font-mono text-sm text-muted-foreground tabular-nums">{rank}</span>

      {item.a ? (
        // Owner avatars come straight from GitHub's CDN; next/image optimisation is off in static export.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.a} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 rounded-md border border-border bg-muted" />
      ) : (
        <div className="size-10 shrink-0 rounded-md border border-border bg-muted" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 text-base leading-snug">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="break-words hover:underline after:absolute after:inset-0 after:content-['']">
                {owner ? <span className="text-muted-foreground">{owner}/</span> : null}
                <span className="font-medium text-foreground">{name}</span>
              </a>
            ) : (
              <span className="font-medium text-foreground">{name}</span>
            )}
          </h3>
          {item.new ? (
            <span className="rounded-sm bg-foreground px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wide text-background">New</span>
          ) : null}
          {stale ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-[11px] text-muted-foreground" title={`Last commit ${item.p}`}>
              <Clock className="size-3" aria-hidden />
              No commits in 3+ months
            </span>
          ) : null}
          {item.f ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/50 px-1.5 py-px text-[11px] text-destructive" title={item.f}>
              <TriangleAlert className="size-3" aria-hidden />
              {item.f}
            </span>
          ) : null}
        </div>

        {isTool && item.rp ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.rp}</p> : null}
        {item.d ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.d}</p> : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {item.l ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: languageColor(item.l) }} aria-hidden />
              {item.l}
            </span>
          ) : null}
          {isTool ? <span className="rounded-sm bg-muted px-1.5 py-px text-foreground">{TYPE_LABEL[item.ty]}</span> : null}
          <span className="rounded-sm border border-border px-1.5 py-px">{categoryLabel(item.c)}</span>
          {item.rm ? (
            <span className="inline-flex items-center gap-1"><Globe className="size-3" aria-hidden /> Hosted</span>
          ) : null}
          {item.pk ? <span className="font-mono">{item.pk}</span> : null}
          {(item.t ?? []).map((t) => (
            <span key={t} className="font-mono">#{t}</span>
          ))}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {item.s > 0 || !isTool ? (
          <div className="inline-flex items-center gap-1 text-sm text-foreground tabular-nums" title={isTool ? "Stars of the repo behind it" : undefined}>
            <Star className="size-3.5" aria-hidden />
            {formatStars(item.s)}
          </div>
        ) : null}
        {item.dl != null ? (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title="Package downloads last week">
            <Download className="size-3" aria-hidden />
            {formatStars(item.dl)}/wk
          </div>
        ) : null}
        {gainLabel && item.g > 0 ? (
          <div className="mt-1 font-mono text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
            +{formatStars(item.g)} <span className="text-muted-foreground">{gainLabel}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
