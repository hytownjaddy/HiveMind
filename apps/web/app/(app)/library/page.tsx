import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Library" };

export default function Page() {
  return (
    <Placeholder
      title="Library"
      rfp="§31-33, §35"
      summary="Source library with provenance and the IP boundary between learning and reproducing."
      items={[
        "Primary / secondary / reference sources",
        "Content claims and provenance",
        "Source health",
      ]}
    />
  );
}
