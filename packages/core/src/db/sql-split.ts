/*
 * Split a SQL script into statements the way `wrangler d1 execute --file`
 * does well enough for our migrations and exports: statements end with `;`,
 * except inside `CREATE TRIGGER … BEGIN … END;`. Comments (`--`) are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inTrigger = false;
  for (const rawLine of sql.split("\n")) {
    const line = rawLine.replace(/\r$/u, "");
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("--")) {
      continue;
    }
    current.push(line);
    const upper = trimmed.toUpperCase();
    if (upper.startsWith("CREATE TRIGGER")) {
      inTrigger = true;
    }
    if (inTrigger) {
      if (upper === "END;" || upper.endsWith(" END;")) {
        statements.push(current.join("\n").trim());
        current = [];
        inTrigger = false;
      }
      continue;
    }
    if (trimmed.endsWith(";")) {
      statements.push(current.join("\n").trim());
      current = [];
    }
  }
  const rest = current.join("\n").trim();
  if (rest.length > 0) {
    statements.push(rest);
  }
  return statements.map((statement) => statement.replace(/;$/u, ""));
}
