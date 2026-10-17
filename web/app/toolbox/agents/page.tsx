import { ListPage, viewMetadata } from "@/components/lists/list-page";
import { LISTS } from "@/lib/data";

const view = { list: "agents", window: LISTS.agents.defaultWindow } as const;
export const metadata = viewMetadata(view);
export default function Page() {
  return <ListPage {...view} />;
}
