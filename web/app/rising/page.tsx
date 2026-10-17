import { ListPage, viewMetadata } from "@/components/lists/list-page";

const view = { list: "rising", window: null } as const;
export const metadata = viewMetadata(view);
export default function Page() {
  return <ListPage {...view} />;
}
