import type { ReactNode } from "react";

import { Shell } from "@/components/shell/Shell";
import { currentPrincipal } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/*
 * Every workstation page requires a validated learner (D-033). Cloudflare
 * Access keeps anonymous browsers out at hivemindjrr.com; this guard covers
 * any other hostname (workers.dev, a misconfigured AUD) with a bare 401 and no
 * data.
 */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const principal = await currentPrincipal();
  if (principal === null) {
    return (
      <main className="hm-mono flex h-dvh flex-col items-center justify-center gap-2 text-[13px]">
        <div className="text-muted">401 · unauthenticated</div>
        <div>sign in through Cloudflare Access at hivemindjrr.com</div>
      </main>
    );
  }
  const { health } = await services();
  const report = await health.report();
  return (
    <Shell
      displayName={principal.learner.display_name}
      target="no target · select target"
      health={report}
    >
      {children}
    </Shell>
  );
}
