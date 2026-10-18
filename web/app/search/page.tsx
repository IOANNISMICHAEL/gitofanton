import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site-shell";
import { SearchPageClient } from "@/app/search/search-page-client";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the top 50,000 GitHub repositories, agent skills, MCP servers and coding agents by name.",
  alternates: { canonical: "/search/" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-[800px] px-4 pb-20 pt-28 sm:px-6">
        <h1 className="mb-6 font-display text-5xl tracking-tight text-foreground text-glow sm:text-7xl">Search</h1>
        {/* useSearchParams: the query is read in the browser (the page itself is static). */}
        <Suspense fallback={null}>
          <SearchPageClient />
        </Suspense>
      </div>
    </SiteShell>
  );
}
