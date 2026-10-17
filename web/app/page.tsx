import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { FooterSection } from "@/components/landing/footer-section";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/data";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Git of Anton",
  url: `${SITE_URL}/`,
  description: "Trending GitHub repositories across every category, ranked from GitHub star activity.",
};

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navigation />
      <HeroSection />
      <FooterSection />
    </main>
  );
}
