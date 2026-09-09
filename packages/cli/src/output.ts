export interface Output {
  log(line: string): void;
  error(line: string): void;
}

export const consoleOutput: Output = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}
