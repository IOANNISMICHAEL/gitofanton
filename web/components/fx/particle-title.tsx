"use client";

import { useEffect, useRef, useState } from "react";

type P = { x: number; y: number; hx: number; hy: number; vx: number; vy: number };
type Star = { x: number; y: number; r: number; phase: number };

/**
 * The hero title drawn as white particles over a faint starfield. Particles assemble on load,
 * scatter away from the pointer and spring back. The real <h1> stays in the page (for search
 * engines, screen readers, no-JS) and is hidden visually only once the canvas is drawing.
 * Reduced motion: drawn once, no animation.
 */
export function ParticleTitle({ text, className }: { text: string; className?: string }) {
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
    const h1 = box.querySelector("h1");
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
      if (box.clientWidth < 10 || box.clientHeight < 10) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      h = box.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Render the title off-screen in the h1's own font, then sample its pixels.
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d")!;
      const font = h1 ? getComputedStyle(h1).fontFamily : "serif";
      let size = Math.min(h * 0.78, 220);
      o.font = `${size}px ${font}`;
      while (o.measureText(text).width > w * 0.96 && size > 20) {
        size -= 2;
        o.font = `${size}px ${font}`;
      }
      o.fillStyle = "#fff";
      o.textBaseline = "middle";
      o.fillText(text, 0, h * 0.52);
      const data = o.getImageData(0, 0, w, h).data;
      const gap = w < 640 ? 3 : 4;
      const next: P[] = [];
      for (let y = 0; y < h; y += gap) {
        for (let x = 0; x < w; x += gap) {
          if (data[(y * w + x) * 4 + 3] > 128) {
            next.push({ x: reduced ? x : Math.random() * w, y: reduced ? y : Math.random() * h, hx: x, hy: y, vx: 0, vy: 0 });
          }
        }
      }
      particles = next;
      stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.2, phase: Math.random() * Math.PI * 2 }));
      return true;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx.globalAlpha = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + s.phase));
        ctx.fillStyle = "#fff";
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#fff";
      const size = w < 640 ? 1.6 : 2;
      for (const p of particles) ctx.fillRect(p.x, p.y, size, size);
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
    // Sample the glyphs only after the display font has loaded, or the particles take the fallback font's shape.
    const fontFamily = h1 ? getComputedStyle(h1).fontFamily : "serif";
    const fontsReady = document.fonts?.load ? document.fonts.load(`100px ${fontFamily}`, text).catch(() => undefined) : Promise.resolve();
    let started = false;
    const start = () => {
      if (cancelled || started || !build()) return;
      started = true;
      setReady(true);
      if (reduced) draw(0);
      else raf = requestAnimationFrame(step);
    };
    void fontsReady.then(start);

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
      if (!started) return void fontsReady.then(start);
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
  }, [text]);

  return (
    <div ref={wrap} className={className} style={{ position: "relative" }}>
      {/* Particles are white, so they only replace the heading in the dark theme. */}
      <h1
        className={`font-display text-[clamp(3rem,9vw,8.5rem)] leading-none tracking-tight text-foreground text-glow transition-opacity duration-500 ${ready ? "dark:opacity-0" : ""}`}
      >
        {text}
      </h1>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 hidden dark:block" />
    </div>
  );
}
