import { ListPage, categoryParams, viewMetadata } from "@/components/lists/list-page";

type Params = Promise<{ category: string }>;
export const dynamicParams = false;
export const generateStaticParams = categoryParams;
export async function generateMetadata({ params }: { params: Params }) {
  return viewMetadata({ list: "gems", window: null, category: (await params).category });
}
export default async function Page({ params }: { params: Params }) {
  return <ListPage list="gems" window={null} category={(await params).category} />;
}
