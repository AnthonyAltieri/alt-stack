#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { openApiToZodTsCode } from "./to-typescript.js";

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Usage: npx zod-openapi <input> [options]

Generate TypeScript types from OpenAPI schema

Arguments:
  input                 OpenAPI schema file path or URL

Options:
  -o, --output <file>   Output file path (default: generated-types.ts)
  -h, --help           Show this help message

Examples:
  # Generate from local file
  npx zod-openapi openapi.json

  # Generate from URL
  npx zod-openapi http://localhost:3000/docs/openapi.json

  # Specify output file
  npx zod-openapi openapi.json -o src/api-types.ts
`);
}

async function fetchSchema(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch schema from ${url}: ${response.statusText}`,
    );
  }
  return await response.json();
}

function loadSchema(path: string): Record<string, unknown> {
  try {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to read schema file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const input = args[0];
  if (typeof input !== "string") {
    console.error("Error: Input argument is required");
    showHelp();
    process.exit(1);
  }

  let outputIndex = args.indexOf("-o");
  if (outputIndex === -1) {
    outputIndex = args.indexOf("--output");
  }
  const outputArg =
    outputIndex !== -1 && outputIndex + 1 < args.length
      ? args[outputIndex + 1]
      : undefined;
  const output =
    typeof outputArg === "string" ? outputArg : "generated-types.ts";

  try {
    // Determine if input is URL or file path
    let schema: Record<string, unknown>;
    if (input.startsWith("http://") || input.startsWith("https://")) {
      console.log(`Fetching schema from ${input}...`);
      schema = await fetchSchema(input);
    } else {
      console.log(`Reading schema from ${input}...`);
      schema = loadSchema(input);
    }

    console.log("Generating TypeScript types...");
    const tsCode = openApiToZodTsCode(schema, undefined, {
      includeRoutes: true,
    });

    writeFileSync(output, tsCode);
    console.log(`✓ Successfully generated types in ${output}`);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

main();
