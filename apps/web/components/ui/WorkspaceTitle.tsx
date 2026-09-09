import type { ReactNode } from "react";

import { Breadcrumb, type Crumb } from "./Breadcrumb";

export interface WorkspaceTitleProps {
  readonly crumbs: readonly Crumb[];
  readonly title: string;
  readonly subtitle: string;
  readonly actions?: ReactNode;
}

/** Breadcrumb, uppercase monospace title, one-line subtitle (UI-SYSTEM §1). */
export function WorkspaceTitle({
  crumbs,
  title,
  subtitle,
  actions,
}: WorkspaceTitleProps) {
  return (
    <div className="flex items-end justify-between border-b border-border px-4 pt-3 pb-2">
      <div>
        <Breadcrumb crumbs={crumbs} />
        <h1 className="hm-title mt-1">{title}</h1>
        <p className="text-[12px] text-muted">{subtitle}</p>
      </div>
      {actions !== undefined ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
