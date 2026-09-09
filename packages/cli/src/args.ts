/*
 * Tiny argv parser: positionals plus `--key value`, `--key=value`, and boolean
 * `--flag`. Repeated keys collect into arrays. `--` ends option parsing.
 */

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string | boolean | readonly string[]>>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};
  let onlyPositionals = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (onlyPositionals || !arg.startsWith("--")) {
      if (arg === "--") {
        onlyPositionals = true;
        continue;
      }
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      onlyPositionals = true;
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf("=");
    let key = body;
    let value: string | boolean;
    if (equals >= 0) {
      key = body.slice(0, equals);
      value = body.slice(equals + 1);
    } else {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else {
        value = true;
      }
    }
    const existing = options[key];
    if (existing === undefined) {
      options[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      options[key] = [String(existing), String(value)];
    }
  }
  return { positionals, options };
}

export function optionString(args: ParsedArgs, key: string): string | undefined {
  const value = args.options[key];
  if (value === undefined || value === true || value === false) {
    return undefined;
  }
  return Array.isArray(value) ? value[value.length - 1] : (value as string);
}

export function optionList(args: ParsedArgs, key: string): string[] {
  const value = args.options[key];
  if (value === undefined || typeof value === "boolean") {
    return [];
  }
  return Array.isArray(value) ? [...value] : [value as string];
}

export function optionFlag(args: ParsedArgs, key: string): boolean {
  const value = args.options[key];
  return value === true || value === "true";
}
