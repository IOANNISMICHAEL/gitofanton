import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { NeonCard } from "@/components/fx/neon-card";
import { HnLive } from "@/components/news/hn-live";
import { NewsletterList } from "@/components/news/newsletter-list";
import { readNews } from "@/lib/server-data";

const description = "Hacker News live, and the latest posts from Simon Willison, Latent Space, Hugging Face, OpenAI and The Pragmatic Engineer.";

export const metadata: Metadata = {
  title: "News",
  description,
  alternates: { canonical: "/news/" },
  openGraph: { title: "News", description, url: "/news/", type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
};

export default function NewsPage() {
  const news = readNews();
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <h1 className="font-display text-6xl tracking-tight text-foreground text-glow sm:text-7xl">News</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{description}</p>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <NeonCard as="section" className="p-5 sm:p-6">
            <h2 className="mb-4 font-display text-3xl text-foreground text-glow">Hacker News</h2>
            <HnLive />
          </NeonCard>
          <NeonCard as="section" className="p-5 sm:p-6">
            <h2 className="mb-4 font-display text-3xl text-foreground text-glow">Newsletters</h2>
            {news?.items.length ? (
              <NewsletterList news={news} />
            ) : (
              <p className="py-6 text-sm text-muted-foreground">Being collected: posts appear after the next update.</p>
            )}
          </NeonCard>
        </div>
      </div>
    </SiteShell>
  );
}
