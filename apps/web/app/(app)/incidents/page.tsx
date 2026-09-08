import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Incidents" };

export default function Page() {
  return (
    <Placeholder
      title="Incidents"
      rfp="§3.5, §24, §92"
      summary="Blind incident mode: no domain named, mission-control workspace."
      items={["Ticket", "Topology", "Terminal", "Metrics and logs", "Timeline and notes"]}
    />
  );
}
