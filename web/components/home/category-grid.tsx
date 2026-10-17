import Link from "next/link";
import {
  Bot, Briefcase, Cloud, Database, FlaskConical, Gamepad2, KanbanSquare, Megaphone, Palette, Server, Shapes, Shield, Terminal, Zap,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES } from "@/lib/data";

const ICONS: Record<string, LucideIcon> = {
  ai: Bot, devtools: Terminal, frontend: Palette, backend: Server, data: Database, devops: Cloud, security: Shield,
  gamedev: Gamepad2, product: KanbanSquare, marketing: Megaphone, productivity: Zap, research: FlaskConical, business: Briefcase, other: Shapes,
};

/** One card per job category: repos + toolbox items, linking to the category page. */
export function CategoryGrid({ repoCounts, toolCounts }: { repoCounts: Record<string, number>; toolCounts: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {CATEGORIES.filter((c) => c.id !== "other").map((c) => {
        const Icon = ICONS[c.id] ?? Shapes;
        const repos = repoCounts[c.id] ?? 0;
        const tools = toolCounts[c.id] ?? 0;
        return (
          <Link
            key={c.id}
            href={`/category/${c.id}/`}
            className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/40"
          >
            <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
            <span className="text-sm font-medium leading-snug text-foreground">{c.label}</span>
            <span className="mt-auto text-xs text-muted-foreground tabular-nums">
              {repos.toLocaleString("en-US")} repos{tools ? ` · ${tools.toLocaleString("en-US")} tools` : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
