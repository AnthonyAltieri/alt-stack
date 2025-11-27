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
): string[] {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const zodExpr = convertSchemaToZodString(schema);
    const schemaName = `${name}Schema`;
    lines.push(`export const ${schemaName} = ${zodExpr};`);
    lines.push(`export type ${name} = z.infer<typeof ${schemaName}>;`);
    lines.push("");
  }

  return lines;
}

function generateTopicSchemas(topics: TopicInfo[]): string[] {
  const lines: string[] = [];
  const generatedSchemas = new Set<string>();

  for (const topicInfo of topics) {
    const schemaName = generateSchemaName(topicInfo.topic, "MessageSchema");

    if (generatedSchemas.has(schemaName)) continue;
    generatedSchemas.add(schemaName);

    if (topicInfo.payloadSchema) {
      const zodExpr = convertSchemaToZodString(topicInfo.payloadSchema);
      lines.push(`export const ${schemaName} = ${zodExpr};`);
    } else {
      lines.push(`export const ${schemaName} = z.unknown();`);
    }

    const typeName = schemaName.replace("Schema", "");
    lines.push(`export type ${typeName} = z.infer<typeof ${schemaName}>;`);
    lines.push("");
  }

  return lines;
}

function generateTopicsObject(topics: TopicInfo[]): string[] {
  const lines: string[] = [];
  const topicEntries: string[] = [];

  const seenTopics = new Set<string>();

  for (const topicInfo of topics) {
    if (seenTopics.has(topicInfo.topic)) continue;
    seenTopics.add(topicInfo.topic);

    const schemaName = generateSchemaName(topicInfo.topic, "MessageSchema");
    topicEntries.push(`  '${topicInfo.topic}': ${schemaName}`);
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

  // Generate component schemas first
  const componentSchemas = asyncapi.components?.schemas ?? {};
  if (Object.keys(componentSchemas).length > 0) {
    lines.push("// Component Schemas");
    lines.push(...generateComponentSchemas(componentSchemas));
  }

  // Parse and generate topic schemas
  const topics = parseAsyncAPIChannels(asyncapi);
  if (topics.length > 0) {
    lines.push("// Topic Message Schemas");
    lines.push(...generateTopicSchemas(topics));

    lines.push("// Topics Object");
    lines.push(...generateTopicsObject(topics));
  }

  return lines.join("\n");
}

