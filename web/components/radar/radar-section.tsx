import Link from "next/link";
import { RadarChart } from "@/components/radar/radar-chart";
import { NeonCard } from "@/components/fx/neon-card";
import { RADAR_CATEGORIES, categoryLabel, type Radar } from "@/lib/data";
import { cn } from "@/lib/utils";

export const radarHref = (category: string) => (category === "ai" ? "/radar/" : `/radar/${category}/`);

/** A category's radar in a panel, with the category picker above it when `picker` is set. */
export function RadarSection({ radar, category, picker = false, title }: { radar: Radar | null; category: string; picker?: boolean; title?: string }) {
  return (
    <NeonCard as="section" className="p-5 sm:p-8">
      {title ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-3xl text-foreground text-glow">{title}</h2>
          {!picker ? (
            <Link href={radarHref(category)} className="text-sm text-muted-foreground hover:text-foreground">
              Every category&apos;s radar
            </Link>
          ) : null}
        </div>
      ) : null}
      <p className="mb-4 max-w-3xl text-muted-foreground">
        The 50 fastest-growing {categoryLabel(category)} projects this week. Quadrants are the kind of thing, rings are size (most stars in the
        centre), and bigger dots gained more stars this week.
      </p>
      {picker ? (
        <nav aria-label="Radar category" className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1">
          {RADAR_CATEGORIES().map((c) => (
            <Link
              key={c.id}
              href={radarHref(c.id)}
              aria-current={c.id === category ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                c.id === category ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {radar && radar.items.length ? (
        <RadarChart radar={radar} className="mx-auto max-w-[760px]" />
      ) : (
        <p className="py-16 text-center text-muted-foreground">No projects in this radar.</p>
      )}
    </NeonCard>
  );
}
