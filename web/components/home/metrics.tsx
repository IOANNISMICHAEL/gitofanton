import { type Meta } from "@/lib/data";
import { CountUp } from "@/components/fx/count-up";
import { NeonCard } from "@/components/fx/neon-card";

/** Headline numbers, all straight from the latest data run. */
export function Metrics({ meta }: { meta: Meta | null }) {
  const t = meta?.toolbox?.byType ?? {};
  const items = [
    { value: meta?.trackedRepos, label: "GitHub repos tracked" },
    { value: t.mcp?.total, label: "MCP servers" },
    { value: t.skill?.total, label: "Agent skills" },
    { value: (t.agent?.total ?? 0) + (t.plugin?.total ?? 0) || undefined, label: "Agents & plugins" },
    { value: meta?.starsToday, label: "Stars gained today" },
  ];
  return (
    <NeonCard>
      <dl className="grid grid-cols-2 sm:grid-cols-5">
        {items.map((m, i) => (
          <div key={m.label} className={`px-5 py-5 ${i > 0 ? "sm:border-l sm:border-border" : ""} ${i > 1 ? "border-t border-border sm:border-t-0" : ""}`}>
            <dd className="font-display text-4xl text-foreground text-glow sm:text-5xl">{m.value ? <CountUp value={m.value} /> : "—"}</dd>
            <dt className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">{m.label}</dt>
          </div>
        ))}
      </dl>
    </NeonCard>
  );
}
