import { formatStars } from "@/lib/data";

/** Stars gained per day since tracking began (days with fewer than 3 are not stored and show as 0). */
export function GrowthChart({ hist, today, asOf }: { hist: [string, number][]; today: number; asOf: string }) {
  const todayDay = asOf.slice(0, 10);
  const known = new Map(hist);
  known.set(todayDay, today);
  const first = hist[0]?.[0] ?? todayDay;
  const days: [string, number][] = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${todayDay}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.push([d, known.get(d) ?? 0]);
  }
  const max = Math.max(1, ...days.map((d) => d[1]));
  const W = 720;
  const H = 160;
  const bw = Math.min(40, W / days.length);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full" role="img" aria-label={`Stars gained per day, ${days.length} days`}>
        {days.map(([d, v], i) => {
          const h = Math.max(1, (v / max) * H);
          const x = i * bw + (W - bw * days.length);
          return (
            <g key={d}>
              <rect x={x + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} className="fill-foreground" opacity={d === todayDay ? 0.45 : 0.85}>
                <title>{`${d}: +${v.toLocaleString("en-US")}${d === todayDay ? " (today so far)" : ""}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={0} y1={H + 0.5} x2={W} y2={H + 0.5} className="stroke-border" />
        <text x={W - bw * days.length} y={H + 18} className="fill-muted-foreground font-mono" fontSize={12}>{days[0][0]}</text>
        <text x={W} y={H + 18} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={12}>today</text>
        <text x={W} y={12} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={12}>max +{formatStars(max)}/day</text>
      </svg>
      <figcaption className="mt-2 text-xs text-muted-foreground">Stars gained per day since {first}; the lighter bar is today so far.</figcaption>
    </figure>
  );
}
