import { ListPage, viewMetadata } from "@/components/lists/list-page";
import { LISTS } from "@/lib/data";

const view = { list: "top", window: LISTS.top.defaultWindow } as const;
export const metadata = viewMetadata(view);
export default function Page() {
  return <ListPage {...view} />;
}
