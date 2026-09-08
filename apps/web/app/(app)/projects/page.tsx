import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return (
    <Placeholder
      title="Projects"
      rfp="§3.7, §72"
      summary="Multi-session engineering projects and portfolio building."
      items={[
        "Project templates",
        "Milestones",
        "Integrated grading",
        "Portfolio export",
      ]}
    />
  );
}
