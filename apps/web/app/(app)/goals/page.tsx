import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <Placeholder
      title="Goals"
      rfp="§112-113, §122-156"
      summary="Career targets, readiness engine, and per-target learning prescriptions."
      items={[
        "Career target hierarchy",
        "Readiness percentage",
        "Hard requirement gates",
        "Course and lab prescription",
      ]}
    />
  );
}
