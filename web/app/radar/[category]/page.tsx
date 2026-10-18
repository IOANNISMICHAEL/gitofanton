import { RadarPage, radarMetadata } from "@/app/radar/radar-page";
import { RADAR_CATEGORIES } from "@/lib/data";

type Params = Promise<{ category: string }>;
export const dynamicParams = false;
// AI & agents lives at /radar/ itself.
export const generateStaticParams = () => RADAR_CATEGORIES().filter((c) => c.id !== "ai").map((c) => ({ category: c.id }));
export async function generateMetadata({ params }: { params: Params }) {
  return radarMetadata((await params).category);
}
export default async function Page({ params }: { params: Params }) {
  return <RadarPage category={(await params).category} />;
}
