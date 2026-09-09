import type { ReactNode } from "react";

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly render: (row: T) => ReactNode;
  readonly width?: string;
}

export interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty: ReactNode;
  readonly rowHref?: (row: T) => string | undefined;
  readonly selectedKey?: string | undefined;
}

/** Dense table with sticky header; empty state renders inside the table (UI-SYSTEM §7). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  selectedKey,
}: DataTableProps<T>) {
  return (
    <table className="hm-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              className={column.numeric ? "num" : ""}
              style={column.width === undefined ? undefined : { width: column.width }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="hm-mono text-muted">
              {empty}
            </td>
          </tr>
        ) : null}
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              className={selectedKey === key ? "bg-panel-2" : ""}
              data-selected={selectedKey === key || undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "num" : ""}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
