#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "../src/cli.ts");
const tsxCliPath = require.resolve("tsx/cli");

const child = spawn(
  process.execPath,
  [tsxCliPath, cliPath, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    cwd: process.cwd(),
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Error running CLI:", error.message);
  process.exit(1);
});
