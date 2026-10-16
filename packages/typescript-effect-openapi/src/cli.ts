#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Effect } from "effect";
import { openApiToEffectTsCode } from "./index.js";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(
      "Usage: effect-openapi <openapi.json> [-o output.ts]\n" +
      "Generate native Effect v4 schemas and an HttpApi named Api.\n" +
      "Writes to stdout when --output is omitted.\n",
    );
    return;
  }
  const [input] = positionals;
  if (positionals.length !== 1 || input === undefined) {
    throw new Error("Expected one OpenAPI JSON file. Use --help for usage.");
  }

  const document: unknown = JSON.parse(await readFile(input, "utf8"));
  const source = await Effect.runPromise(openApiToEffectTsCode({ document }));
  if (values.output !== undefined) {
    await writeFile(values.output, source);
  } else {
    process.stdout.write(source);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
