import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { RepoCard } from "@/components/lists/repo-card";
import { LISTS, SITE_URL, type ListId } from "@/lib/data";
import { readMeta, readToolView } from "@/lib/server-data";

const title = "Agent toolbox: skills, MCP servers and agents";
const description =
  "Agent Skills, MCP servers, coding agents and Claude Code plugins in one place, with the GitHub stars and package downloads behind them. Updated every 4 hours.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/toolbox/" },
  openGraph: { title, description, url: "/toolbox/", type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
};

const SECTIONS: { list: ListId; key: string }[] = [
  { list: "skills", key: "skill" },
  { list: "mcp", key: "mcp" },
  { list: "agents", key: "agent" },
];

export default function ToolboxPage() {
  const meta = readMeta();
  const asOf = meta?.generatedAt ?? "1970-01-01T00:00:00Z";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${SITE_URL}/toolbox/`,
    hasPart: SECTIONS.map((s) => ({ "@type": "ItemList", name: LISTS[s.list].title, url: `${SITE_URL}${LISTS[s.list].base}/` })),
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <header className="mb-10">
          <h1 className="font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">Agent toolbox</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
        </header>
        {SECTIONS.map(({ list, key }) => {
          const L = LISTS[list];
          const view = readToolView(list);
          const count = key === "agent" ? (meta?.toolbox?.byType.agent?.total ?? 0) + (meta?.toolbox?.byType.plugin?.total ?? 0) : meta?.toolbox?.byType[key]?.total;
          return (
            <section key={list} className="mb-14" aria-labelledby={`h-${list}`}>
              <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-border pb-2">
                <h2 id={`h-${list}`} className="font-display text-3xl text-foreground">
                  {L.title}
                </h2>
                <Link href={`${L.base}/`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  {count ? `All ${count.toLocaleString("en-US")}` : "See all"} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">{L.blurb}</p>
              {view.items.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">Being collected: the first items appear after the next discovery run (twice a day).</p>
              ) : (
                <ol className="list-none">
                  {view.items.slice(0, 6).map((item, i) => (
                    <li key={item.id}>
                      <RepoCard item={item} rank={i + 1} gainLabel="this week" asOf={asOf} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </SiteShell>
  );
}
