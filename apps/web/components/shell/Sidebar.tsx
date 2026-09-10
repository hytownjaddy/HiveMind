"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS } from "./nav";

export interface SidebarProps {
  readonly labHost: {
    readonly state: string;
    readonly detail: string;
    readonly cpu_percent: number | null;
    readonly memory_percent: number | null;
    readonly environments: number;
  };
  readonly target: string;
}

export function Sidebar({ labHost, target }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="hm-sidebar flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="hm-label hm-sidebar-text px-2 py-1">{group.label}</div>
            <ul>
              {group.items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                if (item.stage !== undefined) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        title={`Stage ${item.stage}`}
                        className="flex h-7 items-center justify-between rounded-sm px-2 text-dim"
                      >
                        <span className="hm-sidebar-text truncate">{item.label}</span>
                        <span className="hm-mono hm-sidebar-text text-[10px]">
                          s{item.stage}
                        </span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-7 items-center justify-between rounded-sm px-2 ${
                        active
                          ? "bg-panel-2 text-text"
                          : "text-muted hover:bg-panel-2 hover:text-text"
                      }`}
                    >
                      <span className="hm-sidebar-text truncate">{item.label}</span>
                      {item.key !== undefined ? (
                        <kbd className="hm-mono hm-sidebar-text text-[10px] text-dim">
                          g {item.key}
                        </kbd>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div
        className="hm-sidebar-widget border-t border-border p-2"
        data-testid="lab-host-widget"
      >
        <div className="hm-label mb-1">Lab host</div>
        <table className="w-full text-[11px]">
          <tbody className="hm-mono">
            <tr>
              <td className="text-muted">state</td>
              <td className="text-right">{labHost.state}</td>
            </tr>
            <tr>
              <td className="text-muted">cpu / mem</td>
              <td className="text-right">
                {labHost.cpu_percent === null
                  ? "—"
                  : `${Math.round(labHost.cpu_percent)}%`}
                {" / "}
                {labHost.memory_percent === null
                  ? "—"
                  : `${Math.round(labHost.memory_percent)}%`}
              </td>
            </tr>
            <tr>
              <td className="text-muted">envs</td>
              <td className="text-right">{labHost.environments}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-1 truncate text-[11px] text-dim">{labHost.detail}</div>
        <div className="hm-label mt-3 mb-1">Active target</div>
        <div className="hm-mono truncate text-[11px] text-muted">{target}</div>
      </div>
    </aside>
  );
}
