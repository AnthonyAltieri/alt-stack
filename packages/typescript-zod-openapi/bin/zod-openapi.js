#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { accessSync, constants } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '../src/cli.ts');

// Resolve tsx binary from node_modules
let tsxBinary;
try {
  const tsxPackagePath = require.resolve('tsx/package.json');
  const tsxPackageDir = dirname(tsxPackagePath);
  // Look for .bin/tsx relative to node_modules
  // In pnpm, it might be in a different location, so trace back to find node_modules
  let currentDir = tsxPackageDir;
  let dotBinPath;
  while (currentDir !== dirname(currentDir)) {
    dotBinPath = join(currentDir, '.bin/tsx');
    try {
      accessSync(dotBinPath, constants.F_OK);
      tsxBinary = dotBinPath;
      break;
    } catch {
      currentDir = dirname(currentDir);
    }
  }
  // If not found, try bin/tsx in the package directory
  if (!tsxBinary) {
    const binPath = join(tsxPackageDir, 'bin/tsx');
    try {
      accessSync(binPath, constants.F_OK);
      tsxBinary = binPath;
    } catch {
      tsxBinary = 'npx';
    }
  }
} catch {
  // Fallback to npx if tsx is not found
  tsxBinary = 'npx';
}

// Spawn tsx to run the CLI
const args = tsxBinary === 'npx' 
  ? ['tsx', cliPath, ...process.argv.slice(2)]
  : [cliPath, ...process.argv.slice(2)];

const child = spawn(tsxBinary, args, {
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

