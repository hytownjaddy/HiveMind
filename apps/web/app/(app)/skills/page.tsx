import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Skills" };

export default function Page() {
  return (
    <Placeholder
      title="Skills"
      rfp="§2.3, §51-53, §93"
      summary="Interactive skill graph with mastery, attempts, recency, and trend."
      items={[
        "Skill graph explorer",
        "Mastery per skill",
        "Prerequisite drill-down",
        "Weakest related skill",
      ]}
    />
  );
}
