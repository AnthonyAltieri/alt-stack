import {
  createSchemaRegistry,
  findCommonSchemas,
  getSchemaFingerprint,
  preRegisterSchema,
  registerSchema,
  type SchemaRegistry,
} from "./schema-dedup.js";
import { convertSchemaToZodString } from "./to-zod.js";
import type { AnySchema, AsyncAPISpec, TopicInfo } from "./types.js";

// ============================================================================
// AsyncAPI Parsing
// ============================================================================

function parseAsyncAPIChannels(spec: AsyncAPISpec): TopicInfo[] {
  const topics: TopicInfo[] = [];
  const channels = spec.channels ?? {};
  const messages = spec.components?.messages ?? {};
  const schemas = spec.components?.schemas ?? {};

  for (const [channelId, channel] of Object.entries(channels)) {
    const topic = channel.address;
    const channelMessages = channel.messages ?? {};

    for (const [messageName, messageRef] of Object.entries(channelMessages)) {
      let payloadSchema: AnySchema | null = null;

      // Resolve message reference
      if ("$ref" in messageRef && typeof messageRef.$ref === "string") {
        const refMatch = messageRef.$ref.match(/#\/components\/messages\/(.+)/);
        if (refMatch?.[1]) {
          const referencedMessage = messages[refMatch[1]];
          if (referencedMessage?.payload) {
            payloadSchema = resolvePayload(referencedMessage.payload, schemas);
          }
        }
      } else if ("payload" in messageRef) {
        payloadSchema = resolvePayload(messageRef.payload, schemas);
      }

      topics.push({
        topic,
        messageName,
        payloadSchema,
      });
    }
  }

  return topics;
}

function resolvePayload(
  payload: { $ref: string } | AnySchema | undefined,
  schemas: Record<string, AnySchema>,
): AnySchema | null {
  if (!payload) return null;

  if ("$ref" in payload && typeof payload.$ref === "string") {
    const refMatch = payload.$ref.match(/#\/components\/schemas\/(.+)/);
    if (refMatch?.[1]) {
      return schemas[refMatch[1]] ?? null;
    }
    return null;
  }

  return payload as AnySchema;
}

// ============================================================================
// Schema Name Generation
// ============================================================================

function generateSchemaName(topic: string, suffix: string): string {
  return (
    topic
      .split(/[/\-_.]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + suffix
  );
}

// ============================================================================
// Code Generation
// ============================================================================

function generateComponentSchemas(
  schemas: Record<string, AnySchema>,
  registry: SchemaRegistry,
): string[] {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const zodExpr = convertSchemaToZodString(schema);
    const schemaName = `${name}Schema`;
    lines.push(`export const ${schemaName} = ${zodExpr};`);
    lines.push(`export type ${name} = z.infer<typeof ${schemaName}>;`);
    lines.push("");

    // Register component schemas so they can be referenced by topic schemas
    const fingerprint = getSchemaFingerprint(schema);
    preRegisterSchema(registry, schemaName, fingerprint);
  }

  return lines;
}

/**
 * Result of topic schema generation including declarations and name mappings.
 */
interface TopicSchemaResult {
  /** Schema declarations to be emitted */
  declarations: string[];
  /** Maps topic schema name to its canonical name (for deduplication) */
  schemaNameToCanonical: Map<string, string>;
}

function generateTopicSchemas(
  topics: TopicInfo[],
  registry: SchemaRegistry,
): TopicSchemaResult {
  const declarations: string[] = [];
  const schemaNameToCanonical = new Map<string, string>();
  const generatedSchemas = new Set<string>();

  for (const topicInfo of topics) {
    const schemaName = generateSchemaName(topicInfo.topic, "MessageSchema");

    if (topicInfo.payloadSchema) {
      const { isNew, canonicalName } = registerSchema(
        registry,
        schemaName,
        topicInfo.payloadSchema,
      );
      schemaNameToCanonical.set(schemaName, canonicalName);

      if (isNew && !generatedSchemas.has(schemaName)) {
        generatedSchemas.add(schemaName);
        const zodExpr = convertSchemaToZodString(topicInfo.payloadSchema);
        declarations.push(`export const ${schemaName} = ${zodExpr};`);

        const typeName = schemaName.replace("Schema", "");
        declarations.push(
          `export type ${typeName} = z.infer<typeof ${schemaName}>;`,
        );
        declarations.push("");
      } else if (!isNew && schemaName !== canonicalName) {
        if (!generatedSchemas.has(schemaName)) {
          generatedSchemas.add(schemaName);
          declarations.push(`export const ${schemaName} = ${canonicalName};`);

          const typeName = schemaName.replace("Schema", "");
          declarations.push(
            `export type ${typeName} = z.infer<typeof ${schemaName}>;`,
          );
          declarations.push("");
        }
      }
    } else {
      if (!generatedSchemas.has(schemaName)) {
        generatedSchemas.add(schemaName);
        schemaNameToCanonical.set(schemaName, schemaName);
        declarations.push(`export const ${schemaName} = z.unknown();`);

        const typeName = schemaName.replace("Schema", "");
        declarations.push(
          `export type ${typeName} = z.infer<typeof ${schemaName}>;`,
        );
        declarations.push("");
      }
    }
  }

  return { declarations, schemaNameToCanonical };
}

function generateTopicsObject(
  topics: TopicInfo[],
  schemaNameToCanonical: Map<string, string>,
): string[] {
  const lines: string[] = [];
  const topicEntries: string[] = [];

  const seenTopics = new Set<string>();

  /**
   * Resolves a schema name to its canonical name if it exists,
   * otherwise returns the original name.
   */
  const resolveSchemaName = (name: string): string => {
    return schemaNameToCanonical.get(name) ?? name;
  };

  for (const topicInfo of topics) {
    if (seenTopics.has(topicInfo.topic)) continue;
    seenTopics.add(topicInfo.topic);

    const schemaName = generateSchemaName(topicInfo.topic, "MessageSchema");
    // Use canonical name for the Topics object
    topicEntries.push(
      `  '${topicInfo.topic}': ${resolveSchemaName(schemaName)}`,
    );
  }

  lines.push("export const Topics = {");
  lines.push(topicEntries.join(",\n"));
  lines.push("} as const;");
  lines.push("");
  lines.push("export type TopicName = keyof typeof Topics;");
  lines.push(
    "export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;",
  );

  return lines;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Collects all topic schemas for common schema detection.
 */
function collectTopicSchemas(
  topics: TopicInfo[],
): Array<{ name: string; schema: AnySchema }> {
  const collected: Array<{ name: string; schema: AnySchema }> = [];

  for (const topicInfo of topics) {
    if (topicInfo.payloadSchema) {
      const schemaName = generateSchemaName(topicInfo.topic, "MessageSchema");
      collected.push({ name: schemaName, schema: topicInfo.payloadSchema });
    }
  }

  return collected;
}

export function asyncApiToZodTsCode(
  asyncapi: AsyncAPISpec,
  customImportLines?: string[],
): string {
  const lines: string[] = [];

  lines.push("/**");
  lines.push(" * This file was automatically generated from AsyncAPI schema");
  lines.push(" * Do not manually edit this file");
  lines.push(" */");
  lines.push("");
  lines.push("import { z } from 'zod';");
  if (customImportLines) {
    lines.push(...customImportLines);
  }
  lines.push("");

  // Create registry for schema deduplication
  const registry = createSchemaRegistry();

  // Generate component schemas first
  const componentSchemas = asyncapi.components?.schemas ?? {};
  if (Object.keys(componentSchemas).length > 0) {
    lines.push("// Component Schemas");
    lines.push(...generateComponentSchemas(componentSchemas, registry));
  }

  // Parse and generate topic schemas
  const topics = parseAsyncAPIChannels(asyncapi);
  if (topics.length > 0) {
    // Find common schemas that appear multiple times
    const topicSchemaList = collectTopicSchemas(topics);
    const commonSchemas = findCommonSchemas(topicSchemaList, 2);

    // Generate common schemas first if any
    if (commonSchemas.length > 0) {
      lines.push("// Common Message Schemas (deduplicated)");
      for (const common of commonSchemas) {
        const zodExpr = convertSchemaToZodString(common.schema);
        lines.push(`export const ${common.name} = ${zodExpr};`);

        const typeName = common.name.replace("Schema", "");
        lines.push(`export type ${typeName} = z.infer<typeof ${common.name}>;`);
        lines.push("");

        // Pre-register so topic schemas reference this instead of duplicating
        preRegisterSchema(registry, common.name, common.fingerprint);
      }
    }

    // Generate topic schemas with deduplication
    const { declarations, schemaNameToCanonical } = generateTopicSchemas(
      topics,
      registry,
    );

    if (declarations.length > 0) {
      lines.push("// Topic Message Schemas");
      lines.push(...declarations);
    }

    lines.push("// Topics Object");
    lines.push(...generateTopicsObject(topics, schemaNameToCanonical));
  }

  return lines.join("\n");
}

