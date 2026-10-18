import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { RadarSection, radarHref } from "@/components/radar/radar-section";
import { SITE_URL, categoryLabel } from "@/lib/data";
import { readRadar } from "@/lib/server-data";

export function radarMetadata(category: string): Metadata {
  const label = categoryLabel(category);
  const title = `${label} radar: the fastest-growing repos, skills, MCP servers and agents`;
  const description = `The 50 fastest-growing ${label} projects on GitHub this week, by type and size. Updated every 4 hours.`;
  const url = radarHref(category);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
  };
}

export function RadarPage({ category }: { category: string }) {
  const radar = readRadar(category);
  const label = categoryLabel(category);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} radar`,
    url: `${SITE_URL}${radarHref(category)}`,
    numberOfItems: radar?.items.length ?? 0,
    itemListElement: [...(radar?.items ?? [])]
      .sort((a, b) => b.g - a.g)
      .map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.n, url: it.u })),
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/radar/" className="hover:text-foreground">Radar</Link>
        </nav>
        <h1 className="mb-8 font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">{label} radar</h1>
        <RadarSection radar={radar} category={category} picker />
      </div>
    </SiteShell>
  );
}
