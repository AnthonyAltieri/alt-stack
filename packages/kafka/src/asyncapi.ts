import { z } from "zod";
import type { KafkaRouter } from "./router.js";
import type { KafkaProcedure } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface AsyncAPISpec {
  asyncapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  channels: Record<string, AsyncAPIChannel>;
  operations?: Record<string, AsyncAPIOperation>;
  components?: {
    schemas: Record<string, Record<string, unknown>>;
    messages: Record<string, AsyncAPIMessage>;
  };
}

export interface AsyncAPIChannel {
  address: string;
  messages: Record<string, { $ref: string }>;
}

export interface AsyncAPIOperation {
  action: "send" | "receive";
  channel: { $ref: string };
  messages: Array<{ $ref: string }>;
}

export interface AsyncAPIMessage {
  name: string;
  contentType: string;
  payload: { $ref: string } | Record<string, unknown>;
}

export interface GenerateAsyncAPISpecOptions {
  title?: string;
  version?: string;
  description?: string;
}

// ============================================================================
// Schema Conversion
// ============================================================================

function zodToJSONSchema(
  schema: z.ZodTypeAny,
  options?: { io?: "input" | "output" },
): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: options?.io,
    }) as Record<string, unknown>;
  } catch (error) {
    console.warn("Failed to convert Zod schema to JSON Schema:", error);
    return { type: "object" };
  }
}

// ============================================================================
// Schema Registry
// ============================================================================

class SchemaRegistry {
  private schemas: Map<string, Record<string, unknown>> = new Map();
  private schemaHashes: Map<string, string> = new Map();

  private hashSchema(schema: Record<string, unknown>): string {
    return JSON.stringify(schema);
  }

  registerSchema(name: string, schema: Record<string, unknown>): { $ref: string } {
    const hash = this.hashSchema(schema);
    const existingName = this.schemaHashes.get(hash);

    if (existingName) {
      return { $ref: `#/components/schemas/${existingName}` };
    }

    let finalName = name;
    let counter = 1;
    while (this.schemas.has(finalName)) {
      finalName = `${name}${counter}`;
      counter++;
    }

    this.schemas.set(finalName, schema);
    this.schemaHashes.set(hash, finalName);
    return { $ref: `#/components/schemas/${finalName}` };
  }

  getSchemas(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [name, schema] of this.schemas.entries()) {
      result[name] = schema;
    }
    return result;
  }
}

// ============================================================================
// Name Generation
// ============================================================================

function generateMessageName(topic: string): string {
  return (
    topic
      .split(/[/\-_.]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Message"
  );
}

function generateSchemaName(topic: string): string {
  return (
    topic
      .split(/[/\-_.]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Payload"
  );
}

function generateChannelId(topic: string): string {
  return topic.replace(/[/\-_.]/g, "_");
}

// ============================================================================
// Main Generation Function
// ============================================================================

export function generateAsyncAPISpec<TCustomContext extends object = Record<string, never>>(
  router: KafkaRouter<TCustomContext>,
  options: GenerateAsyncAPISpecOptions = {},
): AsyncAPISpec {
  const procedures = router.getProcedures();
  const schemaRegistry = new SchemaRegistry();

  const channels: Record<string, AsyncAPIChannel> = {};
  const operations: Record<string, AsyncAPIOperation> = {};
  const messages: Record<string, AsyncAPIMessage> = {};

  for (const procedure of procedures) {
    const topic = procedure.topic;
    const channelId = generateChannelId(topic);
    const messageName = generateMessageName(topic);
    const schemaName = generateSchemaName(topic);

    // Convert message schema to JSON Schema
    const messageSchema = procedure.config.input?.message;
    let payloadRef: { $ref: string } | Record<string, unknown>;

    if (messageSchema) {
      const jsonSchema = zodToJSONSchema(messageSchema, { io: "input" });
      payloadRef = schemaRegistry.registerSchema(schemaName, jsonSchema);
    } else {
      payloadRef = { type: "object" };
    }

    // Create message definition
    messages[messageName] = {
      name: messageName,
      contentType: "application/json",
      payload: payloadRef,
    };

    // Create channel
    channels[channelId] = {
      address: topic,
      messages: {
        [messageName]: { $ref: `#/components/messages/${messageName}` },
      },
    };

    // Create operation (publish = send to topic)
    operations[`publish${messageName.replace("Message", "")}`] = {
      action: "send",
      channel: { $ref: `#/channels/${channelId}` },
      messages: [{ $ref: `#/components/messages/${messageName}` }],
    };
  }

  const schemas = schemaRegistry.getSchemas();

  const spec: AsyncAPISpec = {
    asyncapi: "3.0.0",
    info: {
      title: options.title ?? "Kafka API",
      version: options.version ?? "1.0.0",
      ...(options.description && { description: options.description }),
    },
    channels,
    operations,
  };

  if (Object.keys(schemas).length > 0 || Object.keys(messages).length > 0) {
    spec.components = {
      schemas,
      messages,
    };
  }

  return spec;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Extract topic names from a router for type inference
 */
export type ExtractTopics<TRouter extends KafkaRouter<any>> =
  TRouter extends KafkaRouter<infer _TContext>
    ? ReturnType<TRouter["getProcedures"]>[number]["topic"]
    : never;

/**
 * Extract message type for a specific topic
 */
export type ExtractMessageType<TRouter extends KafkaRouter<any>, TTopic extends string> =
  TRouter extends KafkaRouter<infer _TContext>
    ? Extract<
        ReturnType<TRouter["getProcedures"]>[number],
        { topic: TTopic }
      > extends KafkaProcedure<infer TInput, any, any, any>
      ? TInput extends { message: infer TMessage }
        ? TMessage extends z.ZodTypeAny
          ? z.infer<TMessage>
          : never
        : never
      : never
    : never;
