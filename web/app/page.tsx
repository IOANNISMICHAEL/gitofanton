import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Tags, Timer } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { CompactList } from "@/components/home/compact-list";
import { CategoryGrid } from "@/components/home/category-grid";
import { Metrics } from "@/components/home/metrics";
import { ParticleLogo, ParticleTitle } from "@/components/fx/particle-title";
import { NeonCard } from "@/components/fx/neon-card";
import { SITE_URL, isToolList, type Item, type ListId, type WindowId } from "@/lib/data";
import { readMeta, readNews, readRadar, readToolView, readToolboxMeta, readView } from "@/lib/server-data";
import { RadarSection } from "@/components/radar/radar-section";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Git of Anton",
  url: `${SITE_URL}/`,
  description: "Trending GitHub repositories, agent skills, MCP servers and coding agents, ranked from GitHub star activity every 4 hours.",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search/?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

/** First N items of a repo list, or of a toolbox list in its default (Trending) order. */
function top(list: ListId, window: WindowId | null, n: number): { items: Item[] } {
  const v = isToolList(list) ? readToolView(list) : readView(list, window);
  return { items: v.items.slice(0, n) };
}

export default function Home() {
  const meta = readMeta();
  const news = readNews();
  const toolMeta = readToolboxMeta();
  const today = top("trending", "today", 10);
  const week = top("trending", "week", 10);
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
        <header className="hero-rays mb-10 text-center">
          <ParticleLogo src="/brand/mark-dark.svg" lightSrc="/brand/mark-light.svg" className="mb-8 flex h-[clamp(150px,22vw,250px)] w-full items-center justify-center sm:mb-10" />
          <ParticleTitle text="Git of Anton" className="flex h-[clamp(120px,20vw,260px)] w-full items-center justify-center" />
          <p className="mx-auto mt-4 max-w-2xl text-xl leading-relaxed text-muted-foreground">What&apos;s taking off on GitHub right now.</p>
          {meta?.trendingTopics?.length ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Trending topics</span>
              {meta.trendingTopics.map((t) => (
                <a
                  key={t}
                  href={`https://github.com/topics/${t}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-3 py-1 font-mono text-sm text-muted-foreground transition-[color,box-shadow] hover:text-foreground hover:shadow-[var(--glow-strong)]"
                >
                  #{t}
                </a>
              ))}
            </div>
          ) : null}
        </header>

        <div className="spotlight">
          <Metrics meta={meta} />
        </div>
        {updated ? (
          <p className="mt-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <span className="live-dot" aria-hidden /> Live · updated {updated}
          </p>
        ) : null}

        {/* GitHub */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <CompactList title="Trending today" subtitle="Fastest growing today, adjusted for size." href="/trending/" items={today.items} gainLabel="today" />
          <CompactList title="Trending this week" subtitle="Fastest growing over 7 days, adjusted for size." href="/trending/week/" items={week.items} gainLabel="this week" />
          <CompactList title="New & rising" subtitle="Created in the last 90 days, by stars this week." href="/rising/" items={rising.items} gainLabel="this week" />
          <CompactList title="Hidden gems" subtitle="Small projects (50–2,000 stars) growing fast." href="/gems/" items={gems.items} gainLabel="this week" />
        </div>

        {/* AI radar */}
        <div className="mt-14">
          <RadarSection radar={readRadar("ai")} category="ai" title="AI & agents radar" />
        </div>

        {/* Categories */}
        <section id="categories" className="mt-14" aria-labelledby="h-categories">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="h-categories" className="font-display text-4xl text-foreground text-glow">Browse by category</h2>
            <Link href="/categories/" className="text-sm text-muted-foreground hover:text-foreground">All categories</Link>
          </div>
          <CategoryGrid repoCounts={meta?.categoryCounts ?? {}} toolCounts={toolMeta?.byCategory ?? {}} />
        </section>

        {/* Toolbox */}
        <section className="mt-14" aria-labelledby="h-toolbox">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="h-toolbox" className="font-display text-4xl text-foreground text-glow">Agent toolbox</h2>
            <Link href="/toolbox/" className="text-sm text-muted-foreground hover:text-foreground">Open the toolbox</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <CompactList title="Skills" href="/toolbox/skills/" items={skills.items} gainLabel="this week" showCategory={false} />
            <CompactList title="MCP servers" href="/toolbox/mcp/" items={mcp.items} gainLabel="this week" showCategory={false} />
            <CompactList title="Agents & plugins" href="/toolbox/agents/" items={agents.items} gainLabel="this week" showCategory={false} />
          </div>
        </section>

        {/* News */}
        {news?.items.length ? (
          <section className="mt-14" aria-labelledby="h-news">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="h-news" className="font-display text-4xl text-foreground text-glow">From the newsletters</h2>
              <Link href="/news/" className="text-sm text-muted-foreground hover:text-foreground">All news</Link>
            </div>
            <NeonCard>
              <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                {news.items.slice(0, 6).map((i) => (
                  <li key={i.u} className="border-border sm:border-b sm:odd:border-r">
                    <a href={i.u} target="_blank" rel="noopener" className="block px-5 py-4 hover:text-foreground">
                      <span className="line-clamp-2 text-foreground">{i.t}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {news.sources.find((s) => s.id === i.s)?.name} · {i.d.slice(0, 10)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </NeonCard>
          </section>
        ) : null}

        {/* How it works */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3" aria-label="How it works">
          {[
            { icon: Timer, title: "Real growth, every 4 hours", text: "We read the star count of ~27,000 repositories and every tracked tool's repo, and rank by what they gained." },
            { icon: ShieldCheck, title: "Bought stars filtered out", text: "Bursts, empty new accounts and coordinated starring are flagged and left out of rankings." },
            { icon: Tags, title: "Grouped by the job", text: "A game-development category holds game repos, Unity MCP servers and Godot skills together." },
          ].map(({ icon: Icon, title, text }) => (
            <NeonCard key={title} className="p-6">
              <Icon className="size-6 text-foreground" aria-hidden />
              <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
              <p className="mt-2 text-muted-foreground">{text}</p>
            </NeonCard>
          ))}
        </section>
      </div>
    </SiteShell>
  );
}
