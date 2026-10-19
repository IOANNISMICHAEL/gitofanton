import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { NeonCard } from "@/components/fx/neon-card";
import { allKits } from "@/lib/kits";

const description = "Hand-picked agent skills, MCP servers and agents for one job each, with the install command and a short reason.";

export const metadata: Metadata = {
  title: "Kits",
  description,
  alternates: { canonical: "/kits/" },
  openGraph: { title: "Kits", description, url: "/kits/", type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
};

export default function KitsPage() {
  const kits = allKits();
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <h1 className="font-display text-6xl tracking-tight text-foreground text-glow sm:text-7xl">Kits</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{description}</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {kits.map((k) => (
            <Link key={k.slug} href={`/kit/${k.slug}/`} className="group">
              <NeonCard className="flex h-full flex-col p-6">
                <h2 className="font-display text-3xl text-foreground text-glow">{k.title}</h2>
                <p className="mt-2 flex-1 text-muted-foreground">{k.intro}</p>
                <p className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground group-hover:text-foreground">
                  {k.tasks.length} tasks <ArrowRight className="size-3.5" aria-hidden />
                </p>
              </NeonCard>
            </Link>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
