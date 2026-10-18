"use client";

import { useEffect, useRef, useState } from "react";

type P = { x: number; y: number; hx: number; hy: number; vx: number; vy: number; b: number };

/** Draws the shape (white on transparent) into an off-screen canvas of the box size. */
type Paint = (o: CanvasRenderingContext2D, w: number, h: number) => void;
type Star = { x: number; y: number; r: number; phase: number };

/**
 * Shared particle engine: a shape drawn as white particles that assemble on load, scatter away from
 * the pointer and spring back, over an optional faint starfield. Pixel brightness becomes particle
 * brightness, so grey parts of a logo stay grey. Reduced motion: drawn once, no animation.
 * `prepare` resolves when the shape can be painted (font loaded, image decoded).
 */
function useParticles(prepare: (box: HTMLElement) => Promise<Paint | null>, opts: { stars: boolean; deps: unknown[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const box = wrap.current;
    const cv = canvas.current;
    if (!box || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let paint: Paint | null = null;
    let particles: P[] = [];
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let visible = true;

    /** Returns false while the box has no size yet (hidden tab, not laid out): the ResizeObserver retries. */
    const build = () => {
      if (!paint || box.clientWidth < 10 || box.clientHeight < 10) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      h = box.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d")!;
      paint(o, w, h);
      const data = o.getImageData(0, 0, w, h).data;
      const gap = w < 640 ? 3 : 4;
      const next: P[] = [];
      for (let y = 0; y < h; y += gap) {
        for (let x = 0; x < w; x += gap) {
          const i = (y * w + x) * 4;
          const b = (data[i + 3] / 255) * (Math.max(data[i], data[i + 1], data[i + 2]) / 255);
          if (b > 0.12) next.push({ x: reduced ? x : Math.random() * w, y: reduced ? y : Math.random() * h, hx: x, hy: y, vx: 0, vy: 0, b });
        }
      }
      particles = next;
      stars = opts.stars
        ? Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.2, phase: Math.random() * Math.PI * 2 }))
        : [];
      return true;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      for (const s of stars) {
        ctx.globalAlpha = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + s.phase));
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      const size = w < 640 ? 1.6 : 2;
      for (const p of particles) {
        ctx.globalAlpha = 0.95 * p.b;
        ctx.fillRect(p.x, p.y, size, size);
      }
      ctx.globalAlpha = 1;
    };
    const step = (t: number) => {
      const R = w < 640 ? 50 : 90;
      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (R - d) / R;
          p.vx += (dx / d) * f * 6;
          p.vy += (dy / d) * f * 6;
        }
        p.vx = (p.vx + (p.hx - p.x) * 0.055) * 0.82;
        p.vy = (p.vy + (p.hy - p.y) * 0.055) * 0.82;
        p.x += p.vx;
        p.y += p.vy;
      }
      draw(t);
      if (visible) raf = requestAnimationFrame(step);
    };

    let cancelled = false;
    const prepared = prepare(box)
      .then((p) => {
        paint = p;
      })
      .catch(() => undefined);
    let started = false;
    const start = () => {
      if (cancelled || started || !build()) return;
      started = true;
      setReady(true);
      if (reduced) draw(0);
      else raf = requestAnimationFrame(step);
    };
    void prepared.then(start);

    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    // Build on first real size, rebuild when the width changes (rotation, window resize).
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      if (!started) return void prepared.then(start);
      if (Math.abs(box.clientWidth - lastW) < 4) return;
      lastW = box.clientWidth;
      if (build() && reduced) draw(0);
    });
    ro.observe(box);
    // Pause the animation while the hero is off screen.
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was && !reduced) raf = requestAnimationFrame(step);
    });
    io.observe(box);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerleave", onLeave);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the caller's deps change
  }, opts.deps);

  return { wrap, canvas, ready };
}

/**
 * The hero title drawn as particles. The real <h1> stays in the page (for search engines, screen
 * readers, no-JS) and is hidden visually only once the canvas is drawing.
 */
export function ParticleTitle({ text, className }: { text: string; className?: string }) {
  const { wrap, canvas, ready } = useParticles(
    async (box) => {
      const h1 = box.querySelector("h1");
      const font = h1 ? getComputedStyle(h1).fontFamily : "serif";
      // Sample the glyphs only after the display font has loaded, or the particles take the fallback font's shape.
      if (document.fonts?.load) await document.fonts.load(`100px ${font}`, text).catch(() => undefined);
      return (o, w, h) => {
        let size = Math.min(h * 0.78, 220);
        o.font = `${size}px ${font}`;
        while (o.measureText(text).width > w * 0.96 && size > 20) {
          size -= 2;
          o.font = `${size}px ${font}`;
        }
        o.fillStyle = "#fff";
        o.textBaseline = "middle";
        o.textAlign = "center";
        o.fillText(text, w / 2, h * 0.52);
      };
    },
    { stars: true, deps: [text] },
  );

  return (
    <div ref={wrap} className={className} style={{ position: "relative" }}>
      {/* Particles are white, so they only replace the heading in the dark theme. */}
      <h1
        className={`w-full text-center font-display text-[clamp(3rem,9vw,8.5rem)] leading-none tracking-tight text-foreground text-glow transition-opacity duration-500 ${ready ? "dark:opacity-0" : ""}`}
      >
        {text}
      </h1>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 hidden dark:block" />
    </div>
  );
}

/**
 * The logo mark drawn as particles, centred in its box. The static <img> shows in the light theme,
 * without JavaScript and until the particles are ready.
 */
export function ParticleLogo({ src, lightSrc, className }: { src: string; lightSrc: string; className?: string }) {
  const { wrap, canvas, ready } = useParticles(
    () =>
      new Promise<Paint>((resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve((o, w, h) => {
            const side = Math.min(w, h);
            o.drawImage(img, (w - side) / 2, (h - side) / 2, side, side);
          });
        img.onerror = reject;
        img.src = src;
      }),
    { stars: false, deps: [src] },
  );
  return (
    <div ref={wrap} className={className} style={{ position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Git of Anton logo" className={`hidden h-full w-auto dark:block transition-opacity duration-500 ${ready ? "opacity-0" : ""}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightSrc} alt="Git of Anton logo" className="h-full w-auto dark:hidden" />
      <canvas ref={canvas} aria-hidden className="absolute inset-0 hidden dark:block" />
    </div>
  );
}
