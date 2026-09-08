import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Practice" };

export default function Page() {
  return (
    <Placeholder
      title="Practice"
      rfp="§3.3, §55-56, §90"
      summary="Adaptive, seeded, validated problem generation targeting one skill."
      items={[
        "Adaptive / domain / skill / difficulty picker",
        "Problem archetypes and fault modules",
        "Reproducible seeds",
        "Deterministic grading",
        "New Problem loop",
      ]}
    />
  );
}
