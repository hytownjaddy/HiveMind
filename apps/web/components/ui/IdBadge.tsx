/** Monospace identifier (D-038) with optional link. */
export function IdBadge({ id, href }: { readonly id: string; readonly href?: string }) {
  const body = (
    <span className="hm-mono rounded-sm border border-border bg-panel-2 px-1 text-[11px]">
      {id}
    </span>
  );
  return href === undefined ? body : <a href={href}>{body}</a>;
}
