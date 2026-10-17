import { formatStars, type Meta } from "@/lib/data";

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
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
      {items.map((m) => (
        <div key={m.label} className="bg-card px-4 py-4">
          <dd className="font-display text-3xl text-foreground tabular-nums sm:text-4xl">{m.value ? formatStars(m.value) : "—"}</dd>
          <dt className="mt-1 text-xs text-muted-foreground">{m.label}</dt>
        </div>
      ))}
    </dl>
  );
}
