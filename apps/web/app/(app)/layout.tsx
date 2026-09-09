import type { ReactNode } from "react";

import { Shell } from "@/components/shell/Shell";
import { currentPrincipal } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [principal, { health }] = await Promise.all([currentPrincipal(), services()]);
  const report = await health.report();
  return (
    <Shell
      displayName={principal?.learner.display_name ?? "?"}
      target="no target · select target"
      health={report}
    >
      {children}
    </Shell>
  );
}
