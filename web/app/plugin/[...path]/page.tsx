import { ItemPage, itemMetadata } from "@/components/item/item-page";
import { pageParams } from "@/lib/items";

type Params = Promise<{ path: string[] }>;
export const dynamicParams = false;
export const generateStaticParams = () => pageParams("plugin");
export async function generateMetadata({ params }: { params: Params }) {
  return itemMetadata("plugin", (await params).path);
}
export default async function Page({ params }: { params: Params }) {
  return <ItemPage kind="plugin" path={(await params).path} />;
}
