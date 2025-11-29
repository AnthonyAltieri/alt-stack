import type { Kafka, Consumer, KafkaConfig, KafkaMessage } from "kafkajs";
import { Kafka as KafkaClass } from "kafkajs";
import type { z } from "zod";
import type {
  WorkerRouter,
  InputConfig,
  TypedWorkerContext,
  WorkerProcedure,
} from "@alt-stack/workers-core";
import {
  validateInput,
  ProcessingError,
  middlewareMarker,
} from "@alt-stack/workers-core";
import type { MiddlewareResult } from "@alt-stack/workers-core";
import type {
  CreateWorkerOptions,
  WorkerResult,
  WarpStreamContext,
  RoutingStrategy,
} from "./types.js";

/** Default routing strategy */
const DEFAULT_ROUTING: RoutingStrategy = { type: "topic-per-job" };

/** WarpStream-optimized defaults */
const WARPSTREAM_DEFAULTS = {
  connectionTimeout: 10000,
  metadataMaxAge: 60000,
} as const;

/** Message envelope for single-queue routing */
interface JobEnvelope {
  jobName: string;
  payload: unknown;
}

/**
 * Create a WarpStream/Kafka worker from a router.
 *
 * The worker starts consuming messages immediately and runs until disconnected.
 * The Kafka consumer keeps the Node.js event loop active automatically.
 *
 * @example
 * ```typescript
 * import { createWorker } from "@alt-stack/workers-warpstream";
 * import { emailRouter } from "./routers/email";
 *
 * async function main() {
 *   const worker = await createWorker(emailRouter, {
 *     kafka: { brokers: ["warpstream.example.com:9092"] },
 *     groupId: "email-workers",
 *     createContext: async () => ({ db: getDb() }),
 *   });
 *
 *   console.log("Worker running, waiting for jobs...");
 *
 *   // Graceful shutdown
 *   const shutdown = async () => {
 *     await worker.disconnect();
 *     process.exit(0);
 *   };
 *   process.on("SIGINT", shutdown);
 *   process.on("SIGTERM", shutdown);
 *
 *   // Block until shutdown (the consumer keeps the process alive,
 *   // but this makes the intent explicit)
 *   await new Promise(() => {});
 * }
 *
 * main();
 * ```
 */
export async function createWorker<TCustomContext extends object = Record<string, never>>(
  router: WorkerRouter<TCustomContext>,
  options: CreateWorkerOptions<TCustomContext>,
): Promise<WorkerResult> {
  const kafka = createKafkaInstance(options.kafka);
  const routing = options.routing ?? DEFAULT_ROUTING;
  const procedures = router.getProcedures();

  const consumer = kafka.consumer({
    ...options.consumerConfig,
    groupId: options.groupId,
  });

  await consumer.connect();

  // Subscribe to topics based on routing strategy
  const topics = getTopicsForRouting(procedures, routing);
  await consumer.subscribe({ topics, fromBeginning: false });

  // Build procedure lookup
  const procedureMap = buildProcedureMap(procedures, routing);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const baseCtx: WarpStreamContext = {
        jobId: `${topic}-${partition}-${message.offset}`,
        jobName: "", // Will be set after routing
        attempt: 1,
        topic,
        partition,
        offset: message.offset,
        message,
      };

      try {
        const { jobName, payload } = extractJobInfo(message, topic, routing);
        baseCtx.jobName = jobName;

        const procedure = procedureMap.get(jobName);
        if (!procedure) {
          throw new ProcessingError(`Unknown job: ${jobName}`, { jobName });
        }

        await executeProcedure(procedure, payload, baseCtx, options);
      } catch (error) {
        if (options.onError) {
          await options.onError(
            error instanceof Error ? error : new Error(String(error)),
            baseCtx,
          );
        }
        throw error;
      }
    },
  });

  return {
    disconnect: () => consumer.disconnect(),
  };
}

function createKafkaInstance(kafkaOrConfig: Kafka | KafkaConfig): Kafka {
  if (typeof (kafkaOrConfig as Kafka).consumer === "function") {
    return kafkaOrConfig as Kafka;
  }
  const config = kafkaOrConfig as KafkaConfig;
  return new KafkaClass({
    ...config,
    connectionTimeout: config.connectionTimeout ?? WARPSTREAM_DEFAULTS.connectionTimeout,
  });
}

function getTopicsForRouting(
  procedures: WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>[],
  routing: RoutingStrategy,
): string[] {
  if (routing.type === "single-queue") {
    return [routing.topic];
  }
  // topic-per-job
  const prefix = routing.topicPrefix ?? "";
  return procedures.map((p) => `${prefix}${p.jobName}`);
}

function buildProcedureMap(
  procedures: WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>[],
  _routing: RoutingStrategy,
): Map<string, WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>> {
  const map = new Map<string, WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>>();
  for (const proc of procedures) {
    map.set(proc.jobName, proc);
  }
  return map;
}

function extractJobInfo(
  message: KafkaMessage,
  topic: string,
  routing: RoutingStrategy,
): { jobName: string; payload: unknown } {
  const value = message.value?.toString();
  if (!value) {
    throw new ProcessingError("Empty message value", { topic });
  }

  if (routing.type === "single-queue") {
    const envelope = JSON.parse(value) as JobEnvelope;
    if (!envelope.jobName) {
      throw new ProcessingError("Missing jobName in envelope", { topic });
    }
    return { jobName: envelope.jobName, payload: envelope.payload };
  }

  // topic-per-job: topic name is job name (minus prefix)
  const prefix = routing.topicPrefix ?? "";
  const jobName = topic.startsWith(prefix) ? topic.slice(prefix.length) : topic;
  return { jobName, payload: JSON.parse(value) };
}

async function executeProcedure<TCustomContext extends object>(
  procedure: WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, TCustomContext>,
  payload: unknown,
  baseCtx: WarpStreamContext,
  options: CreateWorkerOptions<TCustomContext>,
): Promise<void> {
  // Validate input
  const validatedInput = await validateInput(procedure.config.input, payload);

  // Create custom context
  const customContext = options.createContext
    ? await options.createContext(baseCtx)
    : ({} as TCustomContext);

  // Build error function
  const errorFn = (error: unknown): never => {
    if (!procedure.config.errors) {
      throw new ProcessingError("Error occurred", error);
    }

    for (const [_code, schema] of Object.entries(procedure.config.errors)) {
      const result = (schema as z.ZodTypeAny).safeParse(error);
      if (result.success) {
        const errorResponse = result.data;
        throw new ProcessingError(
          typeof errorResponse === "object" &&
          errorResponse !== null &&
          "message" in errorResponse &&
          typeof errorResponse.message === "string"
            ? errorResponse.message
            : "Error occurred",
          errorResponse,
        );
      }
    }

    throw new ProcessingError("Error occurred", error);
  };

  type ProcedureContext = TypedWorkerContext<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >;

  let currentCtx: ProcedureContext = {
    ...customContext,
    ...baseCtx,
    input: validatedInput,
    error: procedure.config.errors ? errorFn : (undefined as never),
  } as ProcedureContext;

  // Run middleware chain
  let middlewareIndex = 0;

  const runMiddleware = async (): Promise<ProcedureContext> => {
    if (middlewareIndex >= procedure.middleware.length) {
      return currentCtx;
    }
    const middleware = procedure.middleware[middlewareIndex++];
    if (!middleware) {
      return currentCtx;
    }
    const result = await middleware({
      ctx: currentCtx,
      next: async (opts?: { ctx?: unknown }): Promise<MiddlewareResult<unknown>> => {
        if (opts?.ctx) {
          currentCtx = { ...currentCtx, ...(opts.ctx as object) } as ProcedureContext;
        }
        const nextResult = await runMiddleware();
        currentCtx = nextResult;
        return { marker: middlewareMarker, ok: true as const, data: currentCtx };
      },
    });

    // Handle MiddlewareResult
    if (result && typeof result === "object" && "marker" in result) {
      return currentCtx;
    }
    currentCtx = result as ProcedureContext;
    return currentCtx;
  };

  currentCtx = await runMiddleware();

  // Run handler
  const response = await procedure.handler({
    input: currentCtx.input,
    ctx: currentCtx,
  });

  // Validate output if schema provided
  if (procedure.config.output && response !== undefined) {
    procedure.config.output.parse(response);
  }
}

