import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Placeholder
      title="Analytics"
      rfp="§49, §94"
      summary="Methodology scoring across correctness, diagnosis, safety, and verification."
      items={[
        "Technical correctness",
        "Diagnosis",
        "Troubleshooting speed",
        "Safety and verification",
        "Communication",
      ]}
    />
  );
}
