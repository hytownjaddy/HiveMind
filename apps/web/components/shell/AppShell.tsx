import Link from "next/link";
import type { ReactNode } from "react";

import { SideNav } from "./SideNav";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 px-3 py-5">
        <Link href="/" className="flex items-center gap-2 px-3">
          <span aria-hidden className="text-lg">
            ⬡
          </span>
          <span className="text-base font-semibold tracking-tight">HiveMind</span>
        </Link>
        <SideNav />
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
