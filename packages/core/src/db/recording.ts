/*
 * A D1Database stand-in that records every statement with its bindings
 * inlined as SQL literals. `hivemind content publish --sql-out` runs the real
 * ContentRepository against it to produce a script that `wrangler d1 execute
 * --file` can apply to any database, so a fresh D1 can be seeded with no
 * server in the loop (restore drill, bootstrap, air-gapped recovery).
 */

type Binding = string | number | boolean | null | ArrayBuffer;

function literal(value: Binding): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "string") {
    return `'${value.replace(/'/gu, "''")}'`;
  }
  return `X'${Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}'`;
}

export function inlineBindings(sql: string, bindings: readonly Binding[]): string {
  let index = 0;
  const output = sql.replace(/\?/gu, () => {
    const value = bindings[index];
    index += 1;
    return literal(value ?? null);
  });
  if (index !== bindings.length) {
    throw new Error(
      `statement has ${index} placeholders but ${bindings.length} bindings`,
    );
  }
  return output;
}

export class RecordingDatabase {
  readonly statements: string[] = [];

  prepare(sql: string): RecordingStatement {
    return new RecordingStatement(this, sql);
  }

  async batch(
    statements: RecordingStatement[],
  ): Promise<{ success: true; meta: { changes: number } }[]> {
    return statements.map((statement) => {
      this.statements.push(statement.toSql());
      return { success: true, meta: { changes: 1 } };
    });
  }

  toScript(): string {
    return `${this.statements.map((statement) => `${statement};`).join("\n")}\n`;
  }

  /** The shim only implements what the repositories use; cast at the call site. */
  asDatabase(): D1Database {
    return this as unknown as D1Database;
  }
}

export class RecordingStatement {
  private bindings: Binding[] = [];

  constructor(
    private readonly database: RecordingDatabase,
    private readonly sql: string,
  ) {}

  bind(...values: Binding[]): RecordingStatement {
    this.bindings = values;
    return this;
  }

  toSql(): string {
    return inlineBindings(this.sql, this.bindings);
  }

  /** Reads answer as an empty database: sequences start at 1 and lookups find nothing. */
  async first<T = unknown>(): Promise<T | null> {
    if (/SELECT MAX\(/iu.test(this.sql)) {
      return { max: null } as T;
    }
    return null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    this.database.statements.push(this.toSql());
    return { success: true, meta: { changes: 1 } };
  }
}
