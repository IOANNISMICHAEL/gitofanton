import { ListPage, otherWindows, viewMetadata } from "@/components/lists/list-page";
import type { WindowId } from "@/lib/data";

type Params = Promise<{ window: WindowId }>;
export const dynamicParams = false;
export const generateStaticParams = () => otherWindows("gems");
export async function generateMetadata({ params }: { params: Params }) {
  return viewMetadata({ list: "gems", window: (await params).window });
}
export default async function Page({ params }: { params: Params }) {
  return <ListPage list="gems" window={(await params).window} />;
}
