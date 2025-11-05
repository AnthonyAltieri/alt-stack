#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve tsx and CLI paths
const tsxPath = require.resolve('tsx/cli.mjs');
const cliPath = join(__dirname, '../src/cli.ts');

// Spawn tsx to run the CLI
const child = spawn('node', [tsxPath, cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Error running CLI:', error.message);
  process.exit(1);
});

