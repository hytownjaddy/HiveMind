/*
 * Compiler diagnostics. Errors make `hivemind content compile` exit non-zero;
 * warnings are printed and tolerated. Every message names the file it is about.
 */

export type DiagnosticLevel = "error" | "warning";

export interface Diagnostic {
  readonly level: DiagnosticLevel;
  readonly path: string;
  readonly message: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(path: string, message: string): void {
    this.items.push({ level: "error", path, message });
  }

  warning(path: string, message: string): void {
    this.items.push({ level: "warning", path, message });
  }

  get errors(): readonly Diagnostic[] {
    return this.items.filter((item) => item.level === "error");
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  format(): string {
    return this.items
      .map((item) => `${item.level}: ${item.path}: ${item.message}`)
      .join("\n");
  }
}
