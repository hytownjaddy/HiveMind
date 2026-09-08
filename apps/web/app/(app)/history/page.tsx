import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "History" };

export default function Page() {
  return (
    <Placeholder
      title="History"
      rfp="§50, §95"
      summary="Replayable attempts: terminal history, diffs, event timeline, AI review."
      items={["Attempt list", "Terminal replay", "Event timeline", "Mastery changes"]}
    />
  );
}
