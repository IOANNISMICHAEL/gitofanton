import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { ListClient } from "@/components/lists/list-client";
import { LanguageSelect } from "@/components/lists/language-select";
import {
  CATEGORIES,
  LANGUAGES,
  LISTS,
  SITE_URL,
  WINDOWS,
  categoryLabel,
  isToolList,
  languageName,
  toolDataPath,
  toolHref,
  toolSortOf,
  toolSortsFor,
  viewDataPath,
  viewHref,
  windowOf,
  type ListId,
  type ToolSortId,
  type WindowId,
} from "@/lib/data";
import { readMeta, readToolView, readView } from "@/lib/server-data";
import { cn } from "@/lib/utils";

const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" };

type ViewProps = { list: ListId; window: WindowId | null; category?: string; lang?: string | null; sort?: ToolSortId };

function describe({ list, window, category = "all", lang = null, sort = "trending" }: ViewProps) {
  const L = LISTS[list];
  const scope = lang ? `${languageName(lang)} ` : category !== "all" ? `${categoryLabel(category)} ` : "";
  const when = !window ? "" : window === "all" ? (list === "trending" ? "since tracking began" : "of all time") : windowOf(window).phrase;
  const heading = lang || category !== "all" ? `${L.title}: ${lang ? languageName(lang) : categoryLabel(category)}` : L.title;
  const title = isToolList(list)
    ? `${toolSortOf(sort).label} ${L.noun}`
    : list === "gems"
        ? `Hidden gems: fast-growing small ${scope}GitHub repositories`
        : list === "rising"
          ? `Rising: new ${scope}GitHub repositories gaining stars`
          : `${L.title} ${scope}GitHub repositories ${when}`;
  const blurb = isToolList(list) ? `${L.blurb} ${toolSortOf(sort).blurb}` : L.blurb;
  const description = `${blurb} ${scope ? `Showing ${scope.trim()} projects. ` : ""}Updated every 4 hours.`;
  return { heading, title, description, blurb };
}

export function viewMetadata(p: ViewProps): Metadata {
  const { title, description } = describe(p);
  const url = isToolList(p.list) ? toolHref(p.list, p.sort) : viewHref(p.list, p.window, p.category, p.lang ?? null);
  return {
    title,
    description,
    alternates: { canonical: url },
    // A page's openGraph replaces the layout's entirely, so repeat the shared image and site name.
    openGraph: { title, description, url, type: "website", siteName: "Git of Anton", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

export function ListPage(p: ViewProps) {
  const { list, window, category = "all", lang = null, sort = "trending" } = p;
  const L = LISTS[list];
  const tool = isToolList(list);
  const view = tool ? readToolView(list, sort) : readView(list, window, category, lang);
  const meta = readMeta();
  const { heading, blurb } = describe(p);
  const href = tool ? toolHref(list, sort) : viewHref(list, window, category, lang);
  const first = view.items.slice(0, 25);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: describe(p).title,
      url: `${SITE_URL}${href}`,
      numberOfItems: Math.min(view.total, 500),
      itemListElement: first.map((it, i) => {
        const repo = it.ty === "repo" ? it.n : it.rp;
        const url = it.ty === "repo" ? `https://github.com/${it.n}` : (it.u ?? (repo ? `https://github.com/${repo}` : undefined));
        return {
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "SoftwareSourceCode",
            name: it.n,
            ...(url ? { url } : {}),
            ...(repo ? { codeRepository: `https://github.com/${repo}` } : {}),
            ...(it.l ? { programmingLanguage: it.l } : {}),
          },
        };
      }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Git of Anton", item: `${SITE_URL}/` },
        ...(isToolList(list) ? [{ "@type": "ListItem", position: 2, name: "Toolbox", item: `${SITE_URL}/toolbox/` }] : []),
        { "@type": "ListItem", position: isToolList(list) ? 3 : 2, name: L.title, item: `${SITE_URL}${L.base}/` },
        ...(category !== "all" || lang ? [{ "@type": "ListItem", position: isToolList(list) ? 4 : 3, name: heading.split(": ")[1], item: `${SITE_URL}${href}` }] : []),
      ],
    },
  ];

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <header className="mb-8">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <span aria-hidden> / </span>
            {isToolList(list) ? (
              <>
                <Link href="/toolbox/" className="hover:text-foreground">Toolbox</Link>
                <span aria-hidden> / </span>
              </>
            ) : null}
            <Link href={`${L.base}/`} className="hover:text-foreground">{L.title}</Link>
          </nav>
          <h1 className="font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">{heading}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{blurb}</p>
        </header>

        {tool ? (
          <nav aria-label="Sort by" className="mb-4 flex flex-wrap gap-1 border-b border-border pb-4">
            {toolSortsFor(list).map((s) => (
              <Link
                key={s.id}
                href={toolHref(list, s.id)}
                aria-current={s.id === sort ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  s.id === sort ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        ) : (
        <div className="mb-4 space-y-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {L.windows ? (
            <nav aria-label="Time window" className="inline-flex rounded-md border border-border p-0.5">
              {WINDOWS.filter((w) => L.windows!.includes(w.id)).map((w) => (
                <Link
                  key={w.id}
                  href={viewHref(list, w.id, category, lang)}
                  aria-current={w.id === window ? "page" : undefined}
                  className={cn(
                    "rounded-[3px] px-3 py-1.5 text-sm transition-colors",
                    w.id === window ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {list === "trending" && w.id === "all" ? "Since tracking" : w.label}
                </Link>
              ))}
            </nav>
            ) : null}
            {L.hasLanguages && window ? <LanguageSelect list={list} window={window} current={lang} languages={LANGUAGES} /> : null}
          </div>

          <nav aria-label="Category" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {[{ id: "all", label: "All" }, ...CATEGORIES].map((c) => {
              const active = !lang && category === c.id;
              const count = c.id === "all" || isToolList(list) ? null : meta?.categoryCounts?.[c.id];
              return (
                <Link
                  key={c.id}
                  href={viewHref(list, window, c.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                    active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  title={count ? `${count.toLocaleString("en-US")} repositories` : undefined}
                >
                  {c.label}
                </Link>
              );
            })}
          </nav>
        </div>
        )}

        <ListClient
          key={href}
          list={list}
          window={window}
          initialItems={first}
          total={view.total}
          dataPath={tool ? toolDataPath(list, sort) : viewDataPath(list, window, category, lang)}
          category={category}
          lang={lang}
          flaggedCount={meta?.counts?.flagged ?? 0}
          asOf={meta?.generatedAt ?? "1970-01-01T00:00:00Z"}
        />

        {meta ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Updated <time dateTime={meta.generatedAt}>{new Date(meta.generatedAt).toUTCString().replace(":00 GMT", " UTC")}</time>
            {" · "}
            {meta.trackedRepos.toLocaleString("en-US")} repositories tracked
            {isToolList(list) && meta.toolbox ? ` · ${Object.values(meta.toolbox.byType).reduce((n, t) => n + t.total, 0).toLocaleString("en-US")} toolbox items` : ""}
          </p>
        ) : null}
      </div>
    </SiteShell>
  );
}

// ---- static params shared by every list route ----
const windowsOf = (list: ListId) => LISTS[list].windows ?? [];
export const otherWindows = (list: ListId) => windowsOf(list).filter((w) => w !== LISTS[list].defaultWindow).map((w) => ({ window: w }));
export const windowCategoryParams = (list: ListId) => windowsOf(list).flatMap((w) => CATEGORIES.map((c) => ({ window: w, category: c.id })));
export const windowLangParams = () => windowsOf("trending").flatMap((w) => LANGUAGES.map((l) => ({ window: w, lang: l.slug })));
export const categoryParams = () => CATEGORIES.map((c) => ({ category: c.id }));
export const toolSortParams = (list: ListId) => toolSortsFor(list).filter((s) => s.id !== "trending").map((s) => ({ sort: s.id }));
