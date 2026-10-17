import type { MetadataRoute } from "next";
import { CATEGORIES, LANGUAGES, LISTS, SITE_URL, viewHref, type ListId } from "@/lib/data";
import { readMeta } from "@/lib/server-data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = readMeta()?.generatedAt ?? new Date().toISOString();
  const urls = new Set<string>(["/", "/toolbox/", "/categories/"]);
  for (const c of CATEGORIES) urls.add(`/category/${c.id}/`);
  for (const list of Object.keys(LISTS) as ListId[]) {
    const windows = LISTS[list].windows ?? [null];
    for (const w of windows) {
      urls.add(viewHref(list, w));
      for (const c of CATEGORIES) urls.add(viewHref(list, w, c.id));
      if (LISTS[list].hasLanguages && w) for (const l of LANGUAGES) urls.add(viewHref(list, w, "all", l.slug));
    }
  }
  return [...urls].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "hourly",
    priority: path === "/" ? 1 : path.split("/").filter(Boolean).length === 1 ? 0.9 : 0.6,
  }));
}
