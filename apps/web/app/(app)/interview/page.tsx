import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Interview" };

export default function Page() {
  return (
    <Placeholder
      title="Interview"
      rfp="§3.6, §60-67"
      summary="Coding, infrastructure, network design, SRE, and behavioral interview simulation."
      items={[
        "Coding interview mode",
        "Infrastructure interview mode",
        "Network design interview mode",
        "Behavioral interviews",
        "Interview replay",
      ]}
    />
  );
}
