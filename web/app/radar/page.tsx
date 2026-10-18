import type { Metadata } from "next";
import { RadarPage, radarMetadata } from "@/app/radar/radar-page";

export const metadata: Metadata = radarMetadata("ai");
export default function Page() {
  return <RadarPage category="ai" />;
}
