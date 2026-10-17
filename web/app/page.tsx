import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Tags, Timer } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { CompactList } from "@/components/home/compact-list";
import { CategoryGrid } from "@/components/home/category-grid";
import { Metrics } from "@/components/home/metrics";
import { SITE_URL, type Item, type ListId, type WindowId } from "@/lib/data";
import { readMeta, readToolboxMeta, readView } from "@/lib/server-data";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Git of Anton",
  url: `${SITE_URL}/`,
  description: "Trending GitHub repositories, agent skills, MCP servers and coding agents, ranked from GitHub star activity every 4 hours.",
};

/** Top N of a view; for toolbox lists, falls back to All time while weekly history is still empty. */
function top(list: ListId, window: WindowId | null, n: number): { items: Item[]; window: WindowId | null } {
  let v = readView(list, window);
  if (v.items.length === 0 && window && window !== "all" && (list === "skills" || list === "mcp" || list === "agents")) v = readView(list, "all");
  return { items: v.items.slice(0, n), window: v.window };
}

export default function Home() {
  const meta = readMeta();
  const toolMeta = readToolboxMeta();
  const today = top("trending", "today", 10);
  const week = top("top", "week", 10);
  const rising = top("rising", null, 8);
  const gems = top("gems", null, 8);
  const skills = top("skills", "week", 6);
  const mcp = top("mcp", "week", 6);
  const agents = top("agents", "week", 6);
  const updated = meta ? new Date(meta.generatedAt).toUTCString().replace(":00 GMT", " UTC") : null;

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        {/* Hero */}
        <header className="mb-8">
          <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[0.95] tracking-tight text-foreground">Git of Anton</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            What&apos;s taking off on GitHub right now — repositories, agent skills, MCP servers and coding agents — by real star growth,
            refreshed every 4 hours.
          </p>
          {meta?.trendingTopics?.length ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Trending topics</span>
              {meta.trendingTopics.map((t) => (
                <a
                  key={t}
                  href={`https://github.com/topics/${t}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                >
                  #{t}
                </a>
              ))}
            </div>
          ) : null}
        </header>

        <Metrics meta={meta} />
        {updated ? <p className="mt-2 text-xs text-muted-foreground">Updated {updated}</p> : null}

        {/* GitHub */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <CompactList title="Trending today" subtitle="Fastest growing today, adjusted for size." href="/trending/" items={today.items} gainLabel="today" />
          <CompactList title="Top this week" subtitle="Most stars gained in the last 7 days." href="/top/week/" items={week.items} gainLabel="this week" />
          <CompactList title="New & rising" subtitle="Created in the last 90 days, by stars this week." href="/rising/" items={rising.items} gainLabel="this week" />
          <CompactList title="Hidden gems" subtitle="Small projects (50–2,000 stars) growing fast." href="/gems/" items={gems.items} gainLabel="this week" />
        </div>

        {/* Categories */}
        <section id="categories" className="mt-14" aria-labelledby="h-categories">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="h-categories" className="font-display text-3xl text-foreground">Browse by category</h2>
            <Link href="/categories/" className="text-sm text-muted-foreground hover:text-foreground">All categories</Link>
          </div>
          <CategoryGrid repoCounts={meta?.categoryCounts ?? {}} toolCounts={toolMeta?.byCategory ?? {}} />
        </section>

        {/* Toolbox */}
        <section className="mt-14" aria-labelledby="h-toolbox">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="h-toolbox" className="font-display text-3xl text-foreground">Agent toolbox</h2>
            <Link href="/toolbox/" className="text-sm text-muted-foreground hover:text-foreground">Open the toolbox</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <CompactList title="Skills" href="/toolbox/skills/" items={skills.items} gainLabel={skills.window === "all" ? null : "this week"} showCategory={false} empty="Collected nightly; first skills appear after the next discovery run." />
            <CompactList title="MCP servers" href="/toolbox/mcp/" items={mcp.items} gainLabel={mcp.window === "all" ? null : "this week"} showCategory={false} />
            <CompactList title="Agents & plugins" href="/toolbox/agents/" items={agents.items} gainLabel={agents.window === "all" ? null : "this week"} showCategory={false} empty="Collected nightly; first agents appear after the next discovery run." />
          </div>
        </section>

        {/* How it works */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3" aria-label="How it works">
          {[
            { icon: Timer, title: "Real growth, every 4 hours", text: "We read the star count of ~27,000 repositories and every tracked tool's repo, and rank by what they gained." },
            { icon: ShieldCheck, title: "Bought stars filtered out", text: "Bursts, empty new accounts and coordinated starring are flagged and left out of rankings." },
            { icon: Tags, title: "Grouped by the job", text: "A game-development category holds game repos, Unity MCP servers and Godot skills together." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-lg border border-border p-5">
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </SiteShell>
  );
}
