"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel with a glowing white hairline. The first time it scrolls into view a bright line traces
 * its outline once (SVG stroke animation), then fades; hovering brightens the glow.
 */
export function NeonCard({ className, children, as: Tag = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "article" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.dataset.traced = "true";
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={cn("neon relative", className)}>
      <svg className="trace-svg" aria-hidden>
        <rect x="0" y="0" width="100%" height="100%" rx="10" pathLength={1} />
      </svg>
      {children}
    </Tag>
  );
}
