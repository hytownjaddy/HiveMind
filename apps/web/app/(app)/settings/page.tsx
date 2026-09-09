import type { Metadata } from "next";

import { currentPrincipal } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** 22-settings.md: identity now; export status, AI modes, runtimes, shortcuts follow. */
export default async function SettingsPage() {
  const principal = await currentPrincipal();
  return (
    <div className="max-w-3xl">
      <h1 className="font-mono text-xl uppercase tracking-wide">Settings</h1>
      <table className="mt-6 w-full font-mono text-sm">
        <tbody>
          <tr>
            <th className="w-48 py-1 text-left font-normal text-zinc-500">identity</th>
            <td>{principal === null ? "unauthenticated" : principal.email}</td>
          </tr>
          <tr>
            <th className="py-1 text-left font-normal text-zinc-500">learner id</th>
            <td>{principal?.learner.id ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
