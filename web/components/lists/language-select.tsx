"use client";

import { useRouter } from "next/navigation";
import { viewHref, type ListId, type WindowId } from "@/lib/data";

export function LanguageSelect({
  list,
  window,
  current,
  languages,
}: {
  list: ListId;
  window: WindowId;
  current: string | null;
  languages: { name: string; slug: string }[];
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      Language
      <select
        value={current ?? ""}
        onChange={(e) => router.push(viewHref(list, window, "all", e.target.value || null))}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      >
        <option value="">All languages</option>
        {languages.map((l) => (
          <option key={l.slug} value={l.slug}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
