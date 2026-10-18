export function HeroSection() {
  return (
    <section className="relative flex flex-col justify-center items-start overflow-hidden bg-background">
      {/* Subtle grid lines */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
        {[...Array(8)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/10"
            style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pt-32 pb-20 lg:pt-40 lg:pb-28">
        <div
          className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700"
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span className="w-8 h-px bg-foreground/30" />
            GitHub, every category, refreshed every 4 hours
          </span>
        </div>

        <h1
          className="text-left text-[clamp(2.5rem,7vw,7rem)] font-display leading-[0.92] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-8 duration-1000"
        >
          Git of Anton
        </h1>

        {/* Radar placeholder — replaced in M3 */}
        <div className="mt-16 aspect-square w-full max-w-[560px] rounded-full border border-foreground/15 flex items-center justify-center">
          <span className="text-sm font-mono text-muted-foreground">Radar loading soon</span>
        </div>
      </div>
    </section>
  );
}
