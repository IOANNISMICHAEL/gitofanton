import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { CategoryGrid } from "@/components/home/category-grid";
import { readMeta, readToolboxMeta } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse trending GitHub repositories, agent skills, MCP servers and agents by the job they do.",
  alternates: { canonical: "/categories/" },
};

export default function CategoriesPage() {
  const meta = readMeta();
  const tools = readToolboxMeta();
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <h1 className="font-display text-5xl tracking-tight text-foreground sm:text-6xl">Categories</h1>
        <p className="mb-8 mt-3 max-w-2xl text-muted-foreground">Grouped by the job a project does, so repos, skills, MCP servers and agents for the same job sit together.</p>
        <CategoryGrid repoCounts={meta?.categoryCounts ?? {}} toolCounts={tools?.byCategory ?? {}} />
      </div>
    </SiteShell>
  );
}
