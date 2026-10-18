import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { CompactList } from "@/components/home/compact-list";
import categoriesConfig from "../../../../config/categories.json";
import { CATEGORIES, SITE_URL, categoryLabel, isToolList, viewHref, type ListId, type WindowId } from "@/lib/data";
import { readToolView, readView } from "@/lib/server-data";

type Params = Promise<{ id: string }>;
export const dynamicParams = false;
export const generateStaticParams = () => CATEGORIES.map((c) => ({ id: c.id }));

const about = (id: string) => categoriesConfig.categories.find((c) => c.id === id)?.about ?? "";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const label = categoryLabel(id);
  const title = `${label}: trending repos, skills, MCP servers and agents`;
  const description = `${about(id)} The fastest-growing GitHub projects and agent tools in ${label}, updated every 4 hours.`;
  return {
    title,
    description,
    alternates: { canonical: `/category/${id}/` },
    openGraph: { title, description, url: `/category/${id}/`, type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
  };
}

function pick(list: ListId, window: WindowId | null, cat: string, n: number) {
  const v = isToolList(list) ? readToolView(list, "trending", cat) : readView(list, window, cat);
  return { items: v.items.slice(0, n), href: viewHref(list, window, cat) };
}

export default async function CategoryPage({ params }: { params: Params }) {
  const { id } = await params;
  const label = categoryLabel(id);
  const trending = pick("trending", "week", id, 10);
  const rising = pick("rising", null, id, 10);
  const skills = pick("skills", "week", id, 6);
  const mcp = pick("mcp", "week", id, 6);
  const agents = pick("agents", "week", id, 6);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: label,
    url: `${SITE_URL}/category/${id}/`,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Git of Anton", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Categories", item: `${SITE_URL}/categories/` },
        { "@type": "ListItem", position: 3, name: label, item: `${SITE_URL}/category/${id}/` },
      ],
    },
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/categories/" className="hover:text-foreground">Categories</Link>
        </nav>
        <h1 className="font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">{label}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{about(id)}</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <CompactList title="Trending this week" href={trending.href} items={trending.items} gainLabel="this week" showCategory={false} />
          <CompactList title="New & rising" href={rising.href} items={rising.items} gainLabel="this week" showCategory={false} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <CompactList title="Skills" href={skills.href} items={skills.items} gainLabel="this week" showCategory={false} empty="No skills in this category yet." />
          <CompactList title="MCP servers" href={mcp.href} items={mcp.items} gainLabel="this week" showCategory={false} empty="No MCP servers in this category yet." />
          <CompactList title="Agents & plugins" href={agents.href} items={agents.items} gainLabel="this week" showCategory={false} empty="No agents or plugins in this category yet." />
        </div>
      </div>
    </SiteShell>
  );
}
