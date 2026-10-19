import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Star, TriangleAlert } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { NeonCard } from "@/components/fx/neon-card";
import { CopyCommand } from "@/components/item/copy-command";
import { SITE_URL, formatStars, linkProps } from "@/lib/data";
import { ROLE_LABEL, allKits, check, getKit } from "@/lib/kits";

type Params = Promise<{ slug: string }>;
export const dynamicParams = false;
export const generateStaticParams = () => allKits().map((k) => ({ slug: k.slug }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const kit = getKit((await params).slug);
  if (!kit) return {};
  const title = `${kit.title} kit: agent skills, MCP servers and agents`;
  const url = `/kit/${kit.slug}/`;
  return {
    title,
    description: kit.intro,
    alternates: { canonical: url },
    openGraph: { title, description: kit.intro, url, type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
  };
}

export default async function KitPage({ params }: { params: Params }) {
  const kit = getKit((await params).slug)!;
  const tasks = kit.tasks.map((t) => ({ ...t, picks: t.picks.map(check) }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${kit.title} kit`,
    url: `${SITE_URL}/kit/${kit.slug}/`,
    itemListElement: tasks.flatMap((t) => t.picks).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      ...(p.href ? { url: p.href.startsWith("/") ? `${SITE_URL}${p.href}` : p.href } : {}),
    })),
  };
  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/kits/" className="hover:text-foreground">Kits</Link>
        </nav>
        <h1 className="font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">{kit.title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{kit.intro}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Picked by hand, reviewed {kit.reviewed}. Stars and status update every 4 hours.</p>

        <ol className="mt-10 space-y-10">
          {tasks.map((t, i) => (
            <li key={t.task}>
              <h2 className="mb-3 flex items-baseline gap-3 font-display text-3xl text-foreground">
                <span className="font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {t.task}
              </h2>
              <div className="space-y-3">
                {t.picks.map((p) => (
                  <NeonCard key={p.name} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">{ROLE_LABEL[p.role]}</p>
                        {p.href ? (
                          <a {...linkProps(p.href)} className="mt-1 inline-flex items-center gap-1.5 text-xl text-foreground hover:underline">
                            {p.name}
                            {p.href.startsWith("/") ? null : <ExternalLink className="size-4" aria-hidden />}
                          </a>
                        ) : (
                          <p className="mt-1 text-xl text-foreground">{p.name}</p>
                        )}
                        <p className="mt-1 text-muted-foreground">{p.why}</p>
                      </div>
                      {p.data?.s ? (
                        <p className="shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                          <Star className="mr-1 inline size-3.5" aria-hidden />
                          {formatStars(p.data.s)}
                          {p.data.g.week > 0 ? <span className="block text-xs text-muted-foreground">+{formatStars(p.data.g.week)} this week</span> : null}
                        </p>
                      ) : null}
                    </div>
                    {p.status ? (
                      <p className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-destructive/50 px-2 py-0.5 text-xs text-destructive">
                        <TriangleAlert className="size-3" aria-hidden /> {p.status.label}
                      </p>
                    ) : null}
                    {p.cmd ? (
                      <div className="mt-4 space-y-2">
                        <CopyCommand label={p.cmd.label} cmd={p.cmd.cmd} />
                        {(p.cmd.then ?? []).map((c) => (
                          <CopyCommand key={c} label="Then" cmd={c} />
                        ))}
                      </div>
                    ) : null}
                  </NeonCard>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-sm text-muted-foreground">
          Other kits: {allKits().filter((k) => k.slug !== kit.slug).map((k, i) => (
            <span key={k.slug}>
              {i ? ", " : ""}
              <Link href={`/kit/${k.slug}/`} className="text-foreground hover:underline">{k.title}</Link>
            </span>
          ))}
        </p>
      </div>
    </SiteShell>
  );
}
