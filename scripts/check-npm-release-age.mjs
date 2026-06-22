#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import https from "node:https";

const DEFAULT_MIN_AGE_DAYS = 7;
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

function parseArgs(argv) {
  const args = {
    baseRef: null,
    excludes: [],
    lockfiles: [],
    minAgeDays: DEFAULT_MIN_AGE_DAYS,
    registry: process.env.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--base-ref") {
      args.baseRef = next();
    } else if (arg === "--exclude") {
      args.excludes.push(next());
    } else if (arg === "--lockfile") {
      args.lockfiles.push(next());
    } else if (arg === "--min-age-days") {
      args.minAgeDays = Number(next());
    } else if (arg === "--registry") {
      args.registry = next();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.minAgeDays) || args.minAgeDays < 0) {
    throw new Error("--min-age-days must be a non-negative number");
  }

  return args;
}

function listTrackedLockfiles() {
  const output = execFileSync("git", ["ls-files"], {
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("pnpm-lock.yaml"));
}

function readBaseFile(baseRef, path) {
  if (!baseRef) {
    return "";
  }

  try {
    return execFileSync("git", ["show", `${baseRef}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function unquoteYamlKey(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parsePnpmPackageKey(rawKey) {
  let spec = unquoteYamlKey(rawKey).replace(/^\/+/, "");

  if (
    spec.startsWith("file:") ||
    spec.startsWith("link:") ||
    spec.startsWith("workspace:") ||
    spec.startsWith("patch:")
  ) {
    return null;
  }

  const peerSuffixIndex = spec.indexOf("(");
  if (peerSuffixIndex !== -1) {
    spec = spec.slice(0, peerSuffixIndex);
  }

  const separatorIndex = spec.lastIndexOf("@");
  if (separatorIndex <= 0) {
    return null;
  }

  const name = spec.slice(0, separatorIndex);
  const version = spec.slice(separatorIndex + 1);

  if (!name || !version || version.includes("/") || version.includes(":")) {
    return null;
  }

  return {
    id: `${name}@${version}`,
    name,
    version,
  };
}

function extractPackageVersions(lockfileContent) {
  const packages = new Map();
  let section = null;

  for (const line of lockfileContent.split(/\r?\n/)) {
    const topLevelMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/);
    if (topLevelMatch) {
      section = topLevelMatch[1];
      continue;
    }

    if (section !== "packages" && section !== "snapshots") {
      continue;
    }

    const keyMatch = line.match(/^  (.+):(?:\s*\{\})?\s*$/);
    if (!keyMatch || keyMatch[1].startsWith(" ")) {
      continue;
    }

    const parsed = parsePnpmPackageKey(keyMatch[1]);
    if (parsed) {
      packages.set(parsed.id, parsed);
    }
  }

  return packages;
}

function matchesPattern(value, pattern) {
  if (pattern.endsWith("/*")) {
    return value.startsWith(pattern.slice(0, -1));
  }

  return value === pattern;
}

function isExcluded(pkg, excludes) {
  return excludes.some(
    (pattern) => matchesPattern(pkg.name, pattern) || matchesPattern(pkg.id, pattern),
  );
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/vnd.npm.install-v1+json, application/json",
            "User-Agent": "alt-stack-package-age-check",
          },
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`GET ${url} failed with HTTP ${response.statusCode}`));
              return;
            }

            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        },
      )
      .on("error", reject);
  });
}

function packageMetadataUrl(registry, packageName) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  return new URL(encodeURIComponent(packageName), base).toString();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lockfiles = args.lockfiles.length > 0 ? args.lockfiles : listTrackedLockfiles();
  const minAgeMs = args.minAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const additions = [];

  for (const lockfile of lockfiles) {
    const currentPackages = extractPackageVersions(readFileSync(lockfile, "utf8"));
    const basePackages = extractPackageVersions(readBaseFile(args.baseRef, lockfile));

    for (const pkg of currentPackages.values()) {
      if (!basePackages.has(pkg.id) && !isExcluded(pkg, args.excludes)) {
        additions.push({ ...pkg, lockfile });
      }
    }
  }

  if (additions.length === 0) {
    console.log("No newly added npm package versions found in pnpm lockfiles.");
    return;
  }

  const metadataByPackage = new Map();
  const failures = [];

  await mapWithConcurrency(additions, 8, async (pkg) => {
    if (!metadataByPackage.has(pkg.name)) {
      metadataByPackage.set(
        pkg.name,
        fetchJson(packageMetadataUrl(args.registry, pkg.name)),
      );
    }

    let metadata;
    try {
      metadata = await metadataByPackage.get(pkg.name);
    } catch (error) {
      failures.push(`${pkg.id} (${pkg.lockfile}): ${error.message}`);
      return;
    }

    const publishedAt = metadata.time?.[pkg.version];
    if (!publishedAt) {
      failures.push(`${pkg.id} (${pkg.lockfile}): missing registry publish timestamp`);
      return;
    }

    const publishedTime = Date.parse(publishedAt);
    if (!Number.isFinite(publishedTime)) {
      failures.push(`${pkg.id} (${pkg.lockfile}): invalid publish timestamp ${publishedAt}`);
      return;
    }

    const ageMs = now - publishedTime;
    if (ageMs < minAgeMs) {
      const ageHours = Math.max(0, ageMs / (60 * 60 * 1000)).toFixed(1);
      failures.push(
        `${pkg.id} (${pkg.lockfile}): published ${ageHours}h ago, required age is ${args.minAgeDays} days`,
      );
    }
  });

  if (failures.length > 0) {
    console.error(
      `Found ${failures.length} newly added npm package version(s) inside the release-age cool-down window:`,
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Checked ${additions.length} newly added npm package version(s); all are at least ${args.minAgeDays} days old.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
