import { ListPage, toolSortParams, viewMetadata } from "@/components/lists/list-page";
import type { ToolSortId } from "@/lib/data";

type Params = Promise<{ sort: ToolSortId }>;
export const dynamicParams = false;
export const generateStaticParams = () => toolSortParams("skills");
export async function generateMetadata({ params }: { params: Params }) {
  return viewMetadata({ list: "skills", window: null, sort: (await params).sort });
}
export default async function Page({ params }: { params: Params }) {
  return <ListPage list="skills" window={null} sort={(await params).sort} />;
}
