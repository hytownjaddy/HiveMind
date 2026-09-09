export interface StatusField {
  readonly label?: string;
  readonly value: string;
}

export interface StatusBarProps {
  readonly version: string;
  readonly connection: string;
  readonly fields?: readonly StatusField[];
}

/** Global status bar (UI-SYSTEM §1): version, connection, then per-screen fields. */
export function StatusBar({ version, connection, fields = [] }: StatusBarProps) {
  const items: StatusField[] = [
    { value: `v${version}` },
    { value: connection },
    ...fields,
  ];
  return (
    <footer className="hm-mono flex h-6 shrink-0 items-center gap-0 border-t border-border bg-panel px-2 text-[11px] text-muted">
      {items.map((field, index) => (
        <span key={`${field.label ?? ""}-${index}`} className="flex items-center">
          {index > 0 ? <span className="mx-2 text-dim">│</span> : null}
          {field.label !== undefined ? (
            <span className="mr-1 text-dim">{field.label}</span>
          ) : null}
          <span>{field.value}</span>
        </span>
      ))}
    </footer>
  );
}
