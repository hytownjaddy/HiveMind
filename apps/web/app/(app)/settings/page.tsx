import type { Metadata } from "next";

import { Pane } from "@/components/ui/Pane";
import { ExecutionBadge } from "@/components/ui/ExecutionBadge";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { currentPrincipal } from "@/lib/server/auth";
import { APP_VERSION } from "@/lib/server/env";
import { RUNTIME_VERSIONS, services } from "@/lib/server/services";
import { LIVE_ITEMS } from "@/components/shell/nav";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/*
 * 22-settings.md: identity, AI execution (external everywhere until Stage 08),
 * data export status from R2, runtime pins, shortcuts, about. Dense tables.
 */
export default async function SettingsPage() {
  const [principal, svc] = await Promise.all([currentPrincipal(), services()]);
  const latestExport =
    svc.exportStore === undefined ? null : await svc.exportStore.latest();
  const settings = principal?.learner.settings;
  const features = ["tutor", "review", "interview", "coach"] as const;
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "System" }, { label: "Settings" }]}
        title="Settings"
        subtitle="identity, AI execution, data, runtimes, shortcuts"
      />
      <div className="grid grid-cols-2 gap-3 p-4">
        <Pane title="Identity" testId="pane-identity">
          <table className="hm-table">
            <tbody>
              <tr>
                <td className="w-48 text-muted">access identity</td>
                <td className="hm-mono">{principal?.email ?? "unauthenticated"}</td>
              </tr>
              <tr>
                <td className="text-muted">learner id</td>
                <td className="hm-mono">{principal?.learner.id ?? "—"}</td>
              </tr>
              <tr>
                <td className="text-muted">display name</td>
                <td>{principal?.learner.display_name ?? "—"}</td>
              </tr>
              <tr>
                <td className="text-muted">provider</td>
                <td className="hm-mono">cloudflare_access · google</td>
              </tr>
            </tbody>
          </table>
        </Pane>
        <Pane title="AI execution" testId="pane-ai">
          <table className="hm-table">
            <thead>
              <tr>
                <th>feature</th>
                <th>mode</th>
                <th>provider</th>
                <th className="num">ceiling</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature}>
                  <td>{feature}</td>
                  <td>
                    <ExecutionBadge
                      mode={settings?.ai_execution[feature] ?? "external"}
                    />
                  </td>
                  <td className="hm-mono text-muted">external mode · no API key</td>
                  <td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-dim">
            Switching a feature to `api` requires a configured key and ceiling (Stage 08).
          </p>
        </Pane>
        <Pane title="Data" testId="pane-data">
          <table className="hm-table">
            <tbody>
              <tr>
                <td className="w-48 text-muted">last D1 export</td>
                <td className="hm-mono">
                  {latestExport === null
                    ? svc.exportStore === undefined
                      ? "exports bucket not configured"
                      : "no export yet"
                    : `${latestExport.key} · ${latestExport.uploaded_at}`}
                </td>
              </tr>
              <tr>
                <td className="text-muted">nightly job</td>
                <td className="hm-mono">
                  .github/workflows/d1-export.yml → R2 exports/d1/
                </td>
              </tr>
              <tr>
                <td className="text-muted">export now</td>
                <td className="hm-mono">bun run hivemind -- export --sql production</td>
              </tr>
              <tr>
                <td className="text-muted">recording retention</td>
                <td className="hm-mono">90 d unless pinned (D-019)</td>
              </tr>
            </tbody>
          </table>
        </Pane>
        <Pane title="Runtimes" testId="pane-runtimes">
          <table className="hm-table">
            <tbody>
              {Object.entries(RUNTIME_VERSIONS).map(([name, version]) => (
                <tr key={name}>
                  <td className="w-48 text-muted">{name}</td>
                  <td className="hm-mono">{version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Pane>
        <Pane title="Shortcuts" testId="pane-shortcuts">
          <table className="hm-table">
            <tbody>
              <tr>
                <td className="hm-mono w-48">⌘ K</td>
                <td>command palette</td>
              </tr>
              {LIVE_ITEMS.filter((item) => item.key !== undefined).map((item) => (
                <tr key={item.href}>
                  <td className="hm-mono">g {item.key}</td>
                  <td>{item.label}</td>
                </tr>
              ))}
              <tr>
                <td className="hm-mono">?</td>
                <td>shortcut help</td>
              </tr>
            </tbody>
          </table>
        </Pane>
        <Pane title="About" testId="pane-about">
          <table className="hm-table">
            <tbody>
              <tr>
                <td className="w-48 text-muted">hivemind</td>
                <td className="hm-mono">v{APP_VERSION} · Stage 01</td>
              </tr>
              <tr>
                <td className="text-muted">domain</td>
                <td className="hm-mono">hivemind.jryans.dev</td>
              </tr>
            </tbody>
          </table>
        </Pane>
      </div>
    </div>
  );
}
