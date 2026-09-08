import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Placeholder
      title="Settings"
      rfp="§85"
      summary="Account, sessions, and preferences."
      items={["Guest session", "Account (future)", "Preferences"]}
    />
  );
}
