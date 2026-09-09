import { currentPrincipal } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/*
 * Control Center (01-control-center.md). Stage 01 task 8 lands identity; the
 * canonical shell and panes follow in the shell task.
 */
export default async function ControlCenterPage() {
  const principal = await currentPrincipal();
  const { health } = await services();
  const report = await health.report();
  return (
    <div className="max-w-5xl">
      <h1 className="font-mono text-xl uppercase tracking-wide">Control Center</h1>
      <p className="mt-1 text-sm text-zinc-400">active target, queues, environment</p>
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-1 font-mono text-sm">
        <dt className="text-zinc-500">learner</dt>
        <dd>
          {principal === null
            ? "unauthenticated"
            : `${principal.learner.id} · ${principal.email}`}
        </dd>
        <dt className="text-zinc-500">environment</dt>
        <dd>
          {report.environment} ·{" "}
          {report.components
            .map((component) => `${component.component} ${component.state}`)
            .join(" · ")}
        </dd>
      </dl>
    </div>
  );
}
