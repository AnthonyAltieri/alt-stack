import type { CliApplication } from "./application.js";

export interface CliWriter {
  write(text: string): unknown;
}

export interface RunCliOptions {
  readonly argv: readonly string[];
  readonly stdout: CliWriter;
  readonly stderr: CliWriter;
  readonly formatValue?: (value: unknown) => string | undefined;
  readonly formatError?: (error: unknown) => string;
}

function defaultErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function writeLine(writer: CliWriter, text: string): void {
  writer.write(text.endsWith("\n") ? text : `${text}\n`);
}

export async function runCli<TCommandPath extends string>(
  application: CliApplication<TCommandPath>,
  options: RunCliOptions,
): Promise<0 | 1 | 2> {
  const outcome = await application.execute(options.argv);

  switch (outcome.type) {
    case "executed": {
      const output = options.formatValue?.(outcome.value);
      if (output !== undefined) writeLine(options.stdout, output);
      return outcome.exitCode;
    }
    case "help":
    case "version":
      writeLine(options.stdout, outcome.text);
      return outcome.exitCode;
    case "usage-error":
      writeLine(options.stderr, `Error: ${outcome.error.message}\n\n${outcome.help}`);
      return outcome.exitCode;
    case "command-error":
      writeLine(
        options.stderr,
        `Error: ${(options.formatError ?? defaultErrorMessage)(outcome.error)}`,
      );
      return outcome.exitCode;
  }
}
