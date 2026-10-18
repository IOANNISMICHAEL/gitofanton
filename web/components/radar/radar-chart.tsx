"use client";

import { useState } from "react";
import { TYPE_LABEL, formatStars, linkProps, type Radar, type RadarItem } from "@/lib/data";
import { cn } from "@/lib/utils";

const SIZE = 800;
const C = SIZE / 2;
const OUTER = 372;
// Ring outer radii, centre → outer (rings hold 5 / 10 / 15 / 20 items, so outer rings get more room).
const RING_R = [0.26, 0.52, 0.76, 1].map((f) => f * OUTER);
// Quadrants clockwise from top-left: Repos · Skills · MCP servers · Agents & plugins.
const Q_START = [-180, -90, 0, 90];
const Q_LABEL_POS = [
  { x: 14, y: 26, anchor: "start" },
  { x: SIZE - 14, y: 26, anchor: "end" },
  { x: SIZE - 14, y: SIZE - 14, anchor: "end" },
  { x: 14, y: SIZE - 14, anchor: "start" },
] as const;

/** Small deterministic hash in [0, 1): stable positions between builds. */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

type Placed = RadarItem & { x: number; y: number; r: number };

function place(items: RadarItem[]): Placed[] {
  const maxG = Math.max(1, ...items.map((i) => i.g));
  const out: Placed[] = [];
  for (let ring = 0; ring < 4; ring++) {
    for (let q = 0; q < 4; q++) {
      const cell = items.filter((i) => i.ring === ring && i.q === q).sort((a, b) => b.g - a.g);
      const inner = ring === 0 ? 24 : RING_R[ring - 1];
      const outer = RING_R[ring];
      cell.forEach((it, k) => {
        // Spread evenly across the quadrant's arc, alternating depth inside the ring band.
        const t = (k + 0.5 + (hash01(it.n) - 0.5) * 0.4) / cell.length;
        const angle = ((Q_START[q] + 6 + t * 78) * Math.PI) / 180;
        const depth = cell.length === 1 ? 0.5 : k % 2 ? 0.7 : 0.3;
        const rad = inner + (outer - inner) * (depth + (hash01(`${it.n}~`) - 0.5) * 0.16);
        out.push({ ...it, x: C + rad * Math.cos(angle), y: C + rad * Math.sin(angle), r: 4 + Math.sqrt(it.g / maxG) * 9 });
      });
    }
  }
  return out;
}

/**
 * The radar: quadrants by type, rings by total stars (largest at the centre), dot size = stars this
 * week. Hover or focus a dot for details; each dot links to the item. Below 640 px a table replaces it.
 */
export function RadarChart({ radar, className }: { radar: Radar; className?: string }) {
  const placed = place(radar.items);
  const [active, setActive] = useState<Placed | null>(null);

  return (
    <div className={cn("relative", className)}>
      <div className="relative hidden sm:block">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label={`Radar of ${radar.items.length} fast-growing items`}>
          {/* rings */}
          {RING_R.map((r, i) => (
            <circle key={r} cx={C} cy={C} r={r} fill="none" className="stroke-foreground" strokeOpacity={0.1 + i * 0.05} strokeWidth={1} />
          ))}
          <line x1={C - OUTER} y1={C} x2={C + OUTER} y2={C} className="stroke-foreground" strokeOpacity={0.18} />
          <line x1={C} y1={C - OUTER} x2={C} y2={C + OUTER} className="stroke-foreground" strokeOpacity={0.18} />
          {/* ring labels: real star ranges, on the vertical axis */}
          {radar.rings.map((ring, i) => (
            <text key={ring.label} x={C + 6} y={C - (i === 0 ? 0 : RING_R[i - 1]) - (RING_R[i] - (i === 0 ? 0 : RING_R[i - 1])) / 2} className="fill-muted-foreground font-mono" fontSize={12}>
              {ring.label}★
            </text>
          ))}
          {/* quadrant labels */}
          {radar.quadrants.map((label, q) => (
            <text key={label} x={Q_LABEL_POS[q].x} y={Q_LABEL_POS[q].y} textAnchor={Q_LABEL_POS[q].anchor} className="fill-foreground font-mono uppercase" fontSize={14} letterSpacing={2}>
              {label}
            </text>
          ))}
          {/* dots */}
          {placed.map((p) => (
            <a
              key={`${p.q}-${p.n}`}
              {...linkProps(p.u)}
              onMouseEnter={() => setActive(p)}
              onMouseLeave={() => setActive((a) => (a === p ? null : a))}
              onFocus={() => setActive(p)}
              onBlur={() => setActive(null)}
              aria-label={`${p.n}, ${TYPE_LABEL[p.ty]}, ${formatStars(p.s)} stars, +${formatStars(p.g)} this week`}
            >
              <circle cx={p.x} cy={p.y} r={p.r + 6} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={p.r}
                className={cn("fill-foreground transition-opacity", active && active !== p ? "opacity-40" : "opacity-90")}
                style={{ filter: "drop-shadow(0 0 4px rgb(255 255 255 / 0.55))" }}
              />
            </a>
          ))}
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-md border border-border bg-background/95 p-3 text-sm shadow-lg backdrop-blur"
            style={{ left: `${(active.x / SIZE) * 100}%`, top: `calc(${(active.y / SIZE) * 100}% + ${active.r + 10}px)` }}
          >
            <p className="truncate font-medium text-foreground">{active.n}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {TYPE_LABEL[active.ty]} · {formatStars(active.s)}★ · +{formatStars(active.g)} this week
            </p>
          </div>
        ) : null}
      </div>

      {/* Phones: the same items as a table, grouped by type. */}
      <div className="sm:hidden">
        {radar.quadrants.map((label, q) => {
          const rows = radar.items.filter((i) => i.q === q).sort((a, b) => b.g - a.g);
          if (!rows.length) return null;
          return (
            <section key={label} className="mb-6">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className="border-b border-border">
                      <td className="py-2 pr-2">
                        <a {...linkProps(r.u)} className="text-foreground hover:underline">
                          {r.n}
                        </a>
                      </td>
                      <td className="py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatStars(r.s)}★</td>
                      <td className="py-2 pl-3 text-right font-mono text-xs tabular-nums text-foreground">+{formatStars(r.g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
