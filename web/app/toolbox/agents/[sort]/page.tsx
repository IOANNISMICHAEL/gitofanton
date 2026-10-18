import { ListPage, toolSortParams, viewMetadata } from "@/components/lists/list-page";
import type { ToolSortId } from "@/lib/data";

type Params = Promise<{ sort: ToolSortId }>;
export const dynamicParams = false;
export const generateStaticParams = () => toolSortParams("agents");
export async function generateMetadata({ params }: { params: Params }) {
  return viewMetadata({ list: "agents", window: null, sort: (await params).sort });
}
export default async function Page({ params }: { params: Params }) {
  return <ListPage list="agents" window={null} sort={(await params).sort} />;
}
