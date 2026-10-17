import { ListPage, otherWindows, viewMetadata } from "@/components/lists/list-page";
import type { WindowId } from "@/lib/data";

type Params = Promise<{ window: WindowId }>;
export const dynamicParams = false;
export const generateStaticParams = () => otherWindows("skills");
export async function generateMetadata({ params }: { params: Params }) {
  return viewMetadata({ list: "skills", window: (await params).window });
}
export default async function Page({ params }: { params: Params }) {
  return <ListPage list="skills" window={(await params).window} />;
}
