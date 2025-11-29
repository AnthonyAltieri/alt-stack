import { z } from "zod";
import type { WorkerRouter } from "./router.js";
import type { WorkerProcedure, InputConfig } from "./types/index.js";

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

function generateMessageName(jobName: string): string {
  return (
    jobName
      .split(/[/\-_.]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Message"
  );
}

function generateSchemaName(jobName: string): string {
  return (
    jobName
      .split(/[/\-_.]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Payload"
  );
}

function generateChannelId(jobName: string): string {
  return jobName.replace(/[/\-_.]/g, "_");
}

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate an AsyncAPI specification from a worker router.
 * Only includes task and queue procedures (cron jobs are excluded as they don't accept external payloads).
 *
 * @example
 * ```typescript
 * import { generateAsyncAPISpec } from "@alt-stack/workers-core";
 * import { appRouter } from "./routers/index.js";
 *
 * const spec = generateAsyncAPISpec(appRouter, {
 *   title: "Workers API",
 *   version: "1.0.0",
 * });
 *
 * writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
 * ```
 */
export function generateAsyncAPISpec<TCustomContext extends object = Record<string, never>>(
  router: WorkerRouter<TCustomContext>,
  options: GenerateAsyncAPISpecOptions = {},
): AsyncAPISpec {
  const allProcedures = router.getProcedures();
  // Filter to only task and queue procedures (they accept external payloads)
  const procedures = allProcedures.filter(
    (p) => p.type === "task" || p.type === "queue",
  );

  const schemaRegistry = new SchemaRegistry();
  const channels: Record<string, AsyncAPIChannel> = {};
  const operations: Record<string, AsyncAPIOperation> = {};
  const messages: Record<string, AsyncAPIMessage> = {};

  for (const procedure of procedures) {
    const jobName = procedure.jobName;
    const channelId = generateChannelId(jobName);
    const messageName = generateMessageName(jobName);
    const schemaName = generateSchemaName(jobName);

    // Convert payload schema to JSON Schema
    const payloadSchema = procedure.config.input?.payload;
    let payloadRef: { $ref: string } | Record<string, unknown>;

    if (payloadSchema) {
      const jsonSchema = zodToJSONSchema(payloadSchema, { io: "input" });
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

    // Create channel (address is the job name)
    channels[channelId] = {
      address: jobName,
      messages: {
        [messageName]: { $ref: `#/components/messages/${messageName}` },
      },
    };

    // Create operation (send = trigger job)
    operations[`trigger${messageName.replace("Message", "")}`] = {
      action: "send",
      channel: { $ref: `#/channels/${channelId}` },
      messages: [{ $ref: `#/components/messages/${messageName}` }],
    };
  }

  const schemas = schemaRegistry.getSchemas();

  const spec: AsyncAPISpec = {
    asyncapi: "3.0.0",
    info: {
      title: options.title ?? "Workers API",
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

/** Extract job names from a router (task and queue types only) */
export type ExtractJobNames<TRouter extends WorkerRouter<any>> =
  TRouter extends WorkerRouter<infer _TContext>
    ? Extract<
        ReturnType<TRouter["getProcedures"]>[number],
        { type: "task" | "queue" }
      >["jobName"]
    : never;

/** Extract payload type for a specific job */
export type ExtractPayloadType<TRouter extends WorkerRouter<any>, TJobName extends string> =
  TRouter extends WorkerRouter<infer _TContext>
    ? Extract<
        ReturnType<TRouter["getProcedures"]>[number],
        { jobName: TJobName }
      > extends WorkerProcedure<infer TInput, any, any, any>
      ? TInput extends { payload: infer TPayload }
        ? TPayload extends z.ZodTypeAny
          ? z.infer<TPayload>
          : never
        : never
      : never
    : never;

