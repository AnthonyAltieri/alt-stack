import type { AnySchema } from "./types.js";

/**
 * Schema deduplication utilities for optimizing generated TypeScript types.
 *
 * This module provides fingerprinting and registry functionality to detect
 * structurally identical schemas and generate them only once, reducing
 * memory usage in consuming TypeScript projects.
 */

/**
 * Recursively sorts an object's keys to create a stable representation.
 * This ensures that {a: 1, b: 2} and {b: 2, a: 1} produce the same fingerprint.
 */
function sortObjectDeep(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectDeep);

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectDeep((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Generates a canonical fingerprint for an AsyncAPI schema.
 * Identical schemas will produce identical fingerprints.
 */
export function getSchemaFingerprint(schema: AnySchema): string {
  return JSON.stringify(sortObjectDeep(schema));
}

/**
 * Registry for tracking unique schemas and their canonical names.
 */
export interface SchemaRegistry {
  /** Map from fingerprint to the first schema name that used it */
  fingerprintToName: Map<string, string>;
  /** Map from schema name to its fingerprint (for reverse lookup) */
  nameToFingerprint: Map<string, string>;
}

/**
 * Creates a new empty schema registry.
 */
export function createSchemaRegistry(): SchemaRegistry {
  return {
    fingerprintToName: new Map(),
    nameToFingerprint: new Map(),
  };
}

/**
 * Result of registering a schema.
 */
export interface RegisterSchemaResult {
  /** Whether this is a new unique schema */
  isNew: boolean;
  /** The canonical name for this schema (may be different from input name if duplicate) */
  canonicalName: string;
}

/**
 * Registers a schema in the registry. If an identical schema already exists,
 * returns the existing canonical name instead.
 */
export function registerSchema(
  registry: SchemaRegistry,
  name: string,
  schema: AnySchema,
): RegisterSchemaResult {
  const fingerprint = getSchemaFingerprint(schema);

  const existing = registry.fingerprintToName.get(fingerprint);
  if (existing) {
    return { isNew: false, canonicalName: existing };
  }

  registry.fingerprintToName.set(fingerprint, name);
  registry.nameToFingerprint.set(name, fingerprint);
  return { isNew: true, canonicalName: name };
}

/**
 * Pre-registers a schema with a specific fingerprint.
 * Used for common schemas that should take priority.
 */
export function preRegisterSchema(
  registry: SchemaRegistry,
  name: string,
  fingerprint: string,
): void {
  registry.fingerprintToName.set(fingerprint, name);
  registry.nameToFingerprint.set(name, fingerprint);
}

/**
 * Represents a common schema that appears multiple times.
 */
export interface CommonSchema {
  /** The canonical name for this schema */
  name: string;
  /** The schema definition */
  schema: AnySchema;
  /** The fingerprint for deduplication */
  fingerprint: string;
  /** Number of times this schema appears */
  count: number;
}

/**
 * Scans schemas and identifies those that appear multiple times.
 * Returns common schemas sorted by count (most common first).
 */
export function findCommonSchemas(
  schemas: Array<{ name: string; schema: AnySchema }>,
  minCount: number = 2,
): CommonSchema[] {
  const fingerprints = new Map<
    string,
    { schema: AnySchema; names: string[] }
  >();

  // Count occurrences of each unique schema
  for (const { name, schema } of schemas) {
    const fingerprint = getSchemaFingerprint(schema);
    const existing = fingerprints.get(fingerprint);

    if (existing) {
      existing.names.push(name);
    } else {
      fingerprints.set(fingerprint, {
        schema,
        names: [name],
      });
    }
  }

  // Filter to schemas appearing minCount+ times
  const commonSchemas: CommonSchema[] = [];
  for (const [fingerprint, data] of fingerprints) {
    if (data.names.length >= minCount) {
      // Use first occurrence as the canonical name
      const name = data.names[0]!;

      commonSchemas.push({
        name,
        schema: data.schema,
        fingerprint,
        count: data.names.length,
      });
    }
  }

  // Sort by count descending (most common first)
  return commonSchemas.sort((a, b) => b.count - a.count);
}
