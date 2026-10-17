import { ListPage, viewMetadata, windowLangParams } from "@/components/lists/list-page";
import type { WindowId } from "@/lib/data";

type Params = Promise<{ window: WindowId; lang: string }>;
export const dynamicParams = false;
export const generateStaticParams = windowLangParams;
export async function generateMetadata({ params }: { params: Params }) {
  const { window, lang } = await params;
  return viewMetadata({ list: "trending", window, lang });
}
export default async function Page({ params }: { params: Params }) {
  const { window, lang } = await params;
  return <ListPage list="trending" window={window} lang={lang} />;
}
