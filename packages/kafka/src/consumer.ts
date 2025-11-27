import type { Kafka, Consumer, ConsumerConfig, KafkaConfig } from "kafkajs";
import { Kafka as KafkaClass } from "kafkajs";
import type { z } from "zod";
import type {
  TypedKafkaContext,
  InputConfig,
  BaseKafkaContext,
  KafkaProcedure,
  InferInput,
} from "./types.js";
import type { KafkaRouter } from "./router.js";
import { validateMessage } from "./validation.js";
import { ProcessingError } from "./errors.js";

export interface CreateConsumerOptions<
  TCustomContext extends object = Record<string, never>,
> {
  kafka: Kafka | KafkaConfig;
  consumerConfig?: Omit<ConsumerConfig, "groupId">;
  groupId: string;
  createContext?: (
    baseCtx: BaseKafkaContext,
  ) => Promise<TCustomContext> | TCustomContext;
  onError?: (error: Error) => void;
}

export async function createConsumer<
  TCustomContext extends object = Record<string, never>,
>(
  router: KafkaRouter<TCustomContext>,
  options: CreateConsumerOptions<TCustomContext>,
): Promise<Consumer> {
  const kafkaInstance =
    typeof (options.kafka as any).consumer === "function"
      ? (options.kafka as Kafka)
      : createKafka(options.kafka as KafkaConfig);

  const consumer = kafkaInstance.consumer({
    ...options.consumerConfig,
    groupId: options.groupId,
  });

  await consumer.connect();

  const procedures = router.getProcedures();
  const routerMiddleware = router.getMiddleware();

  // Get unique topics from procedures
  const topics = Array.from(new Set(procedures.map((p) => p.topic)));

  // Subscribe to all topics
  await consumer.subscribe({ topics, fromBeginning: false });

  // Map topics to procedures (a topic can have multiple procedures if merged)
  const topicProcedures = new Map<
    string,
    KafkaProcedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >[]
  >();

  for (const procedure of procedures) {
    const existing = topicProcedures.get(procedure.topic) ?? [];
    existing.push(procedure);
    topicProcedures.set(procedure.topic, existing);
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const baseCtx: BaseKafkaContext = {
          message,
          topic,
          partition,
          offset: message.offset,
        };

        const proceduresForTopic = topicProcedures.get(topic) ?? [];

        for (const procedure of proceduresForTopic) {
          // Create custom context
          const customContext = options.createContext
            ? await options.createContext(baseCtx)
            : ({} as TCustomContext);

          // Validate input
          const inputConfig = procedure.config.input;
          const validatedInput = await validateMessage(
            inputConfig,
            message.value,
          );

          const errorFn = (error: unknown): never => {
            if (!procedure.config.errors) {
              throw new ProcessingError("Error occurred", error);
            }

            for (const [_code, schema] of Object.entries(
              procedure.config.errors,
            )) {
              const result = (schema as z.ZodTypeAny).safeParse(error);
              if (result.success) {
                const errorResponse = result.data;
                throw new ProcessingError(
                  typeof errorResponse === "object" &&
                  errorResponse !== null &&
                  "error" in errorResponse &&
                  typeof errorResponse.error === "object" &&
                  errorResponse.error !== null &&
                  "message" in errorResponse.error &&
                  typeof errorResponse.error.message === "string"
                    ? errorResponse.error.message
                    : "Error occurred",
                  errorResponse,
                );
              }
            }

            throw new ProcessingError("Error occurred", error);
          };

          type ProcedureContext = TypedKafkaContext<
            InputConfig,
            z.ZodTypeAny | undefined,
            Record<string, z.ZodTypeAny> | undefined,
            TCustomContext
          >;

          const ctx: ProcedureContext = {
            ...customContext,
            ...baseCtx,
            input: validatedInput as InferInput<InputConfig>,
            error: procedure.config.errors ? errorFn : (undefined as any),
          } as ProcedureContext;

          let currentCtx: ProcedureContext = ctx;
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
              next: async (opts?: { ctx?: any }) => {
                if (opts?.ctx) {
                  currentCtx = {
                    ...currentCtx,
                    ...opts.ctx,
                  } as ProcedureContext;
                }
                const nextResult = await runMiddleware();
                currentCtx = nextResult;
                return { marker: "middlewareMarker" as any, ok: true as const, data: currentCtx };
              },
            });
            // Handle MiddlewareResult
            if (result && typeof result === "object" && "marker" in result) {
              return currentCtx;
            }
            currentCtx = result as ProcedureContext;
            return currentCtx;
          };

          // Run router middleware first
          for (const middleware of routerMiddleware) {
            const result = await middleware({
              ctx: currentCtx as BaseKafkaContext,
              next: async (opts?: { ctx: Partial<BaseKafkaContext> }) => {
                if (opts?.ctx) {
                  currentCtx = {
                    ...currentCtx,
                    ...opts.ctx,
                  } as ProcedureContext;
                }
                return currentCtx as BaseKafkaContext;
              },
            });
            currentCtx = result as ProcedureContext;
          }

          // Run procedure middleware
          currentCtx = await runMiddleware();

          // Run handler with { input, ctx } signature
          const response = await procedure.handler({
            input: currentCtx.input,
            ctx: currentCtx,
          });

          // Validate output if schema is provided
          if (procedure.config.output && response !== undefined) {
            procedure.config.output.parse(response);
          }
        }
      } catch (error) {
        if (options.onError) {
          options.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        throw error;
      }
    },
  });

  return consumer;
}

function createKafka(config: KafkaConfig): Kafka {
  return new KafkaClass(config);
}
