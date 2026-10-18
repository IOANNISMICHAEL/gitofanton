import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Download, ExternalLink, Globe, Star, TriangleAlert } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { NeonCard } from "@/components/fx/neon-card";
import { CopyCommand } from "@/components/item/copy-command";
import { GrowthChart } from "@/components/item/growth-chart";
import { SITE_URL, categoryLabel, formatStars, languageColor } from "@/lib/data";
import { KIND_LABEL, PLACEHOLDER, getPage, installCommand, pagesGeneratedAt, type PageData, type PageKind, type Ref } from "@/lib/items";

const STALE_DAYS = 90;
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" };

function describe(p: PageData) {
  const what = KIND_LABEL[p.k];
  const growth = p.g.week > 0 ? ` +${p.g.week.toLocaleString("en-US")} stars this week.` : "";
  const desc = p.d ? `${p.d.slice(0, 150)}${p.d.length > 150 ? "…" : ""}` : `${what} on GitHub.`;
  return {
    title: `${p.n}: ${what.toLowerCase()}${p.s ? `, ${formatStars(p.s)} stars` : ""}`,
    description: `${desc}${growth} ${categoryLabel(p.c)}; stats and star growth updated every 4 hours.`.trim(),
  };
}

export function itemMetadata(kind: PageKind, path: string[]): Metadata {
  const p = getPage(kind, path);
  if (!p) return { title: "Not found", robots: { index: false } };
  const { title, description } = describe(p);
  const url = `/${p.p}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "Git of Anton", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

function RefList({ title, refs }: { title: string; refs: Ref[] }) {
  if (!refs.length) return null;
  return (
    <NeonCard as="section" className="p-5">
      <h2 className="mb-3 font-display text-2xl text-foreground text-glow">{title}</h2>
      <ul className="divide-y divide-border">
        {refs.map((r) => (
          <li key={r.p}>
            {/* Plain <a>: item pages ship without client-navigation payloads. */}
            <a href={`/${r.p}/`} className="flex items-center justify-between gap-3 py-2.5 hover:text-foreground">
              <span className="min-w-0">
                <span className="block truncate text-foreground">{r.n}</span>
                <span className="font-mono text-xs text-muted-foreground">{KIND_LABEL[r.k]}</span>
              </span>
              <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {r.s ? `${formatStars(r.s)}★` : ""}
                {r.g > 0 ? <span className="ml-2 text-foreground">+{formatStars(r.g)}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </NeonCard>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-l border-border pl-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl text-foreground tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function ItemPage({ kind, path }: { kind: PageKind; path: string[] }) {
  const p = getPage(kind, path);
  if (!p || path[0] === PLACEHOLDER) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[800px] px-4 pb-20 pt-28">
          <h1 className="font-display text-5xl text-foreground">Not here yet</h1>
          <p className="mt-3 text-muted-foreground">Item pages are built from the latest data run.</p>
        </div>
      </SiteShell>
    );
  }
  const asOf = pagesGeneratedAt();
  const stale = !!p.pu && Date.parse(asOf) - Date.parse(p.pu) > STALE_DAYS * 86_400_000;
  const install = installCommand(p);
  const [owner] = (p.repo ?? "").split("/");
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: p.n,
      url: `${SITE_URL}/${p.p}/`,
      ...(p.d ? { description: p.d } : {}),
      ...(p.repo ? { codeRepository: `https://github.com/${p.repo}` } : {}),
      ...(p.l ? { programmingLanguage: p.l } : {}),
      ...(p.lic ? { license: p.lic } : {}),
      ...(p.t.length ? { keywords: p.t.join(", ") } : {}),
      ...(p.cr ? { dateCreated: p.cr } : {}),
      ...(p.pu ? { dateModified: p.pu } : {}),
      ...(owner ? { author: { "@type": "Organization", name: owner, url: `https://github.com/${owner}` } } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Git of Anton", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: categoryLabel(p.c), item: `${SITE_URL}/category/${p.c}/` },
        { "@type": "ListItem", position: 3, name: p.n, item: `${SITE_URL}/${p.p}/` },
      ],
    },
  ];

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span aria-hidden> / </span>
          <Link href={`/category/${p.c}/`} className="hover:text-foreground">{categoryLabel(p.c)}</Link>
        </nav>

        <header className="flex items-start gap-5">
          {p.a ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.a} alt="" width={72} height={72} className="hidden size-[72px] shrink-0 rounded-lg border border-border sm:block" />
          ) : null}
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
              {KIND_LABEL[p.k]}
              {p.repo && p.k !== "repo" ? ` · ${p.repo}` : ""}
            </p>
            <h1 className="mt-1 break-words font-display text-5xl tracking-tight text-foreground text-glow sm:text-6xl">{p.n}</h1>
            {p.d ? <p className="mt-3 max-w-3xl text-lg text-muted-foreground">{p.d}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <a href={p.u} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-background">
                Open source <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {p.home && p.home !== p.u ? (
                <a href={p.home} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground">
                  <Globe className="size-3.5" aria-hidden /> Website
                </a>
              ) : null}
              <Link href={`/category/${p.c}/`} className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground">
                {categoryLabel(p.c)}
              </Link>
              {p.l ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: languageColor(p.l) }} aria-hidden /> {p.l}
                </span>
              ) : null}
              {p.lic ? <span className="text-muted-foreground">{p.lic}</span> : null}
            </div>
            {p.flag || p.arch || stale ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {p.flag ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/50 px-2 py-0.5 text-destructive">
                    <TriangleAlert className="size-3" aria-hidden /> {p.flag}
                  </span>
                ) : null}
                {p.arch ? <span className="rounded-sm border border-border px-2 py-0.5 text-muted-foreground">Archived</span> : null}
                {stale && !p.arch ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-muted-foreground">
                    <Clock className="size-3" aria-hidden /> No commits since {p.pu}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {p.s ? <Stat label="Stars" value={formatStars(p.s)} sub={p.k !== "repo" ? "of the repo behind it" : undefined} /> : null}
          {p.repo ? <Stat label="Today" value={`+${formatStars(p.g.today)}`} sub="last 24 hours" /> : null}
          {p.repo ? <Stat label="This week" value={`+${formatStars(p.g.week)}`} /> : null}
          {p.dl != null ? <Stat label="Downloads" value={formatStars(p.dl)} sub={`per week on ${p.reg}`} /> : p.repo ? <Stat label="Forks" value={formatStars(p.f)} /> : null}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {install ? (
              <NeonCard className="p-5">
                <CopyCommand label={install.label} cmd={install.cmd} />
                {p.pk && p.k === "mcp" ? <p className="mt-2 font-mono text-xs text-muted-foreground">Package: {p.pk} ({p.reg})</p> : null}
              </NeonCard>
            ) : p.rm ? (
              <NeonCard className="p-5">
                <p className="text-sm text-muted-foreground">Hosted MCP server: connect to it from your client using the endpoint on its source page.</p>
              </NeonCard>
            ) : null}
            {p.repo ? (
              <NeonCard as="section" className="p-5">
                <h2 className="mb-3 font-display text-2xl text-foreground text-glow">Star growth</h2>
                <GrowthChart hist={p.hist} today={p.g.today} asOf={asOf} />
              </NeonCard>
            ) : null}
            {p.t.length ? (
              <div className="flex flex-wrap gap-2">
                {p.t.map((t) => (
                  <a key={t} href={`https://github.com/topics/${t}`} target="_blank" rel="noopener" className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                    #{t}
                  </a>
                ))}
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {p.cr ? (<><dt className="text-muted-foreground">Created</dt><dd className="sm:col-span-2 text-foreground">{p.cr}</dd></>) : null}
              {p.pu ? (<><dt className="text-muted-foreground">Last commit</dt><dd className="sm:col-span-2 text-foreground">{p.pu}</dd></>) : null}
              {p.seen && p.k !== "repo" ? (<><dt className="text-muted-foreground">First seen</dt><dd className="sm:col-span-2 text-foreground">{p.seen}</dd></>) : null}
              {p.path ? (<><dt className="text-muted-foreground">File</dt><dd className="sm:col-span-2 break-all font-mono text-xs text-foreground">{p.path}</dd></>) : null}
              {p.s ? (<><dt className="text-muted-foreground">Gained since tracking</dt><dd className="sm:col-span-2 text-foreground">+{p.g.all.toLocaleString("en-US")} <Star className="inline size-3" aria-hidden /></dd></>) : null}
              {p.dl != null ? (<><dt className="text-muted-foreground">Weekly downloads</dt><dd className="sm:col-span-2 text-foreground"><Download className="mr-1 inline size-3" aria-hidden />{p.dl.toLocaleString("en-US")}</dd></>) : null}
            </dl>
          </div>
          <div className="space-y-4">
            <RefList title="From the same repo" refs={p.same} />
            <RefList title={`Similar in ${categoryLabel(p.c)}`} refs={p.similar} />
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">Updated {new Date(asOf).toUTCString().replace(":00 GMT", " UTC")} · description from the project itself</p>
      </div>
    </SiteShell>
  );
}
