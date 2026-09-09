import Link from "next/link";

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

export function Breadcrumb({ crumbs }: { readonly crumbs: readonly Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="hm-mono flex items-center gap-1 text-[11px] text-muted"
    >
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
          {index > 0 ? <span className="text-dim">›</span> : null}
          {crumb.href !== undefined ? (
            <Link href={crumb.href} className="hover:text-text">
              {crumb.label}
            </Link>
          ) : (
            <span>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
