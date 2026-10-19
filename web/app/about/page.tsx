import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { NeonCard } from "@/components/fx/neon-card";
import { CATEGORIES, SITE_URL, formatStars } from "@/lib/data";
import { readMeta, readToolboxMeta } from "@/lib/server-data";

const title = "About Git of Anton";
const description = "What Git of Anton is, how it ranks GitHub projects and agent tools, and why it looks different from GitHub's own trending page.";

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: { canonical: "/about/" },
  openGraph: { title, description, url: "/about/", type: "website", siteName: "Git of Anton", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Git of Anton" }] },
};

// Same formula the lists use (pipeline/src/score.ts).
const momentum = (gain: number, stars: number) => gain / Math.log10(stars + 100);

function Section({ n, heading, text, children }: { n: string; heading: string; text: string; children: React.ReactNode }) {
  return (
    <section className="grid items-center gap-6 border-t border-border py-12 md:grid-cols-[1fr_1.2fr] md:gap-12">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">{n}</p>
        <h2 className="mt-2 font-display text-4xl text-foreground text-glow">{heading}</h2>
        <p className="mt-3 max-w-md text-lg leading-relaxed text-muted-foreground">{text}</p>
      </div>
      <NeonCard className="p-5 sm:p-6">{children}</NeonCard>
    </section>
  );
}

/** Two projects gain the same 500 stars; the smaller one ranks higher. */
function GrowthChart() {
  const rows = [
    { name: "Big project", stars: 50_000, gain: 500 },
    { name: "Small project", stars: 800, gain: 500 },
  ].map((r) => ({ ...r, score: momentum(r.gain, r.stars) }));
  const max = Math.max(...rows.map((r) => r.score));
  return (
    <svg viewBox="0 0 520 190" className="h-auto w-full" role="img" aria-label="Same 500 stars gained: the 800-star project scores higher than the 50,000-star one">
      {rows.map((r, i) => {
        const y = 24 + i * 82;
        const w = (r.score / max) * 300;
        return (
          <g key={r.name}>
            <text x={0} y={y} className="fill-foreground" fontSize={15}>{r.name}</text>
            <text x={0} y={y + 20} className="fill-muted-foreground font-mono" fontSize={12}>{formatStars(r.stars)} stars, +{r.gain} this week</text>
            <rect x={0} y={y + 32} width={w} height={16} rx={3} className="fill-foreground" opacity={i ? 0.95 : 0.45} />
            <text x={w + 10} y={y + 45} className="fill-foreground font-mono" fontSize={13}>{Math.round(r.score)}</text>
          </g>
        );
      })}
      <text x={0} y={186} className="fill-muted-foreground font-mono" fontSize={11}>score = stars gained / log10(total stars + 100)</text>
    </svg>
  );
}

/** Illustration: normal starring vs a bought burst inside one hour. */
function BurstChart() {
  const organic = [3, 4, 2, 5, 4, 6, 5, 7, 6, 5, 8, 6, 7, 9, 8, 7, 6, 8, 9, 7, 6, 5, 6, 4];
  const bought = organic.map((v, i) => (i === 14 ? 92 : v));
  const H = 70;
  const bars = (data: number[], y0: number, hot: boolean) =>
    data.map((v, i) => {
      const h = (v / 92) * H;
      return <rect key={i} x={i * 21} y={y0 + H - h} width={15} height={Math.max(1.5, h)} rx={2} className="fill-foreground" opacity={hot && v > 50 ? 1 : 0.4} />;
    });
  return (
    <svg viewBox="0 0 504 210" className="h-auto w-full" role="img" aria-label="Example: stars spread over the day versus most of a day's stars arriving in one hour">
      <text x={0} y={12} className="fill-muted-foreground font-mono" fontSize={12}>Real growth: stars spread over the day</text>
      {bars(organic, 20, false)}
      <text x={0} y={122} className="fill-muted-foreground font-mono" fontSize={12}>Bought: most of the day&apos;s stars in one hour</text>
      {bars(bought, 130, true)}
    </svg>
  );
}

/** Everything we track, by type: one stacked bar from the latest data. */
function MixChart({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  const shades = [1, 0.7, 0.45, 0.25];
  // Left edge of each segment: the running total of the ones before it.
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((n, p) => n + (p.value / total) * 500, 0));
  return (
    <div>
      <svg viewBox="0 0 500 36" className="h-auto w-full" role="img" aria-label="Share of tracked items by type">
        {parts.map((p, i) => (
          <rect key={p.label} x={starts[i]} y={0} width={Math.max(0, (p.value / total) * 500 - 2)} height={36} rx={3} className="fill-foreground" opacity={shades[i]} />
        ))}
      </svg>
      <ul className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-foreground" style={{ opacity: shades[i] }} aria-hidden />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="ml-auto font-mono text-foreground tabular-nums">{p.value.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Items per category, repos and tools together. */
function CategoryChart({ rows }: { rows: { id: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/category/${r.id}/`} className="group grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground group-hover:text-foreground">{r.label}</span>
            <span className="h-2.5 rounded-sm bg-foreground/80 transition-opacity group-hover:opacity-100" style={{ width: `${(r.value / max) * 100}%`, opacity: 0.75 }} />
            <span className="text-right font-mono text-xs tabular-nums text-foreground">{formatStars(r.value)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Steps() {
  const steps = [
    ["Count", "Star counts for every tracked repo"],
    ["Check", "Bought or coordinated stars left out"],
    ["Rank", "By growth, adjusted for size"],
    ["Publish", "Lists, radars and item pages"],
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {steps.map(([h, t], i) => (
        <li key={h} className="relative rounded-md border border-border p-4">
          <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
          <p className="mt-1 text-lg text-foreground">{h}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t}</p>
        </li>
      ))}
    </ol>
  );
}

export default function AboutPage() {
  const meta = readMeta();
  const tm = readToolboxMeta();
  const t = meta?.toolbox?.byType ?? {};
  const mix = [
    { label: "MCP servers", value: t.mcp?.total ?? 0 },
    { label: "GitHub repos", value: meta?.trackedRepos ?? 0 },
    { label: "Agent skills", value: t.skill?.total ?? 0 },
    { label: "Agents and plugins", value: (t.agent?.total ?? 0) + (t.plugin?.total ?? 0) },
  ].sort((a, b) => b.value - a.value);
  const cats = CATEGORIES.filter((c) => c.id !== "other")
    .map((c) => ({ id: c.id, label: c.label, value: (meta?.categoryCounts?.[c.id] ?? 0) + (tm?.byCategory?.[c.id] ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const jsonLd = { "@context": "https://schema.org", "@type": "AboutPage", name: title, url: `${SITE_URL}/about/`, description };

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <header className="pb-10">
          <h1 className="font-display text-6xl tracking-tight text-foreground text-glow sm:text-8xl">About</h1>
          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted-foreground">
            Git of Anton shows what is growing on GitHub right now: repos, agent skills, MCP servers and coding agents, in one place, updated every
            4 hours.
          </p>
        </header>

        <Section
          n="01"
          heading="Growth, not size"
          text="Most trending lists favour projects that are already huge. We rank by stars gained, adjusted for size, so a small project with a real jump shows up next to the giants."
        >
          <GrowthChart />
        </Section>

        <Section
          n="02"
          heading="Real stars only"
          text="Some projects buy stars. We check the fastest risers for sudden bursts, brand new accounts and coordinated starring, and keep them out of the rankings."
        >
          <BurstChart />
          <p className="mt-3 font-mono text-xs text-muted-foreground">Example. Flagged projects stay visible behind &quot;Show flagged&quot;.</p>
        </Section>

        <Section
          n="03"
          heading="Agent tools next to the code"
          text="Skills, MCP servers and agents sit beside the repos behind them, with their stars, weekly downloads and a one-line install command."
        >
          <MixChart parts={mix} />
        </Section>

        <Section
          n="04"
          heading="Sorted by the job"
          text="Everything lands in one of 13 categories, so game dev, security or marketing each get their own lists and radar."
        >
          <CategoryChart rows={cats} />
        </Section>

        <section className="border-t border-border py-12">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">05</p>
          <h2 className="mt-2 font-display text-4xl text-foreground text-glow">Every 4 hours</h2>
          <div className="mt-6">
            <Steps />
          </div>
        </section>

        <p className="border-t border-border pt-8 text-sm text-muted-foreground">
          Free and independent, not affiliated with GitHub. Data from GitHub, the official MCP Registry, npm and PyPI.
        </p>
      </div>
    </SiteShell>
  );
}
