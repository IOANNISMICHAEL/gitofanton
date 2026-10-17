import { ListPage, viewMetadata, windowCategoryParams } from "@/components/lists/list-page";
import type { WindowId } from "@/lib/data";

type Params = Promise<{ window: WindowId; category: string }>;
export const dynamicParams = false;
export const generateStaticParams = () => windowCategoryParams("skills");
export async function generateMetadata({ params }: { params: Params }) {
  const { window, category } = await params;
  return viewMetadata({ list: "skills", window, category });
}
export default async function Page({ params }: { params: Params }) {
  const { window, category } = await params;
  return <ListPage list="skills" window={window} category={category} />;
}
