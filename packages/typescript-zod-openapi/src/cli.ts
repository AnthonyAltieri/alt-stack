#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openApiToZodTsCode } from "./to-typescript.js";

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Usage: npx zod-openapi <input> [options]

Generate TypeScript types from OpenAPI schema

Arguments:
  input                    OpenAPI schema file path or URL

Options:
  -o, --output <file>      Output file path (default: generated-types.ts)
  -r, --registry <file>    Registry file that registers custom schemas
  -i, --include <file>     TypeScript file to include at top of generated output
  -h, --help               Show this help message

Examples:
  # Generate from local file
  npx zod-openapi openapi.json

  # Generate from URL
  npx zod-openapi http://localhost:3000/docs/openapi.json

  # Specify output file
  npx zod-openapi openapi.json -o src/api-types.ts

  # Use custom registry for format mappings
  npx zod-openapi openapi.json -r ./my-registry.ts

  # Include custom imports/schemas in generated output
  npx zod-openapi openapi.json -i ./custom-schemas.ts

  # Combine registry and include
  npx zod-openapi openapi.json -r ./my-registry.ts -i ./custom-schemas.ts -o src/api-types.ts
`);
}

function getArgValue(shortFlag: string, longFlag: string): string | undefined {
  let idx = args.indexOf(shortFlag);
  if (idx === -1) idx = args.indexOf(longFlag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
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

  const output = getArgValue("-o", "--output") ?? "generated-types.ts";
  const registryFile = getArgValue("-r", "--registry");
  const includeFile = getArgValue("-i", "--include");

  try {
    // Load registry file if provided (populates global schema registry)
    if (registryFile) {
      console.log(`Loading registry from ${registryFile}...`);
      await import(resolve(registryFile));
    }

    // Read include file contents if provided
    let includeContent: string | undefined;
    if (includeFile) {
      console.log(`Reading include file from ${includeFile}...`);
      includeContent = readFileSync(includeFile, "utf8");
    }

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
    const customImportLines = includeContent ? [includeContent] : undefined;
    const tsCode = openApiToZodTsCode(schema, customImportLines, {
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
