import type { Kafka, KafkaConfig, KafkaMessage } from "kafkajs";
import { Kafka as KafkaClass } from "kafkajs";
import type { z } from "zod";
import type {
  WorkerRouter,
  InputConfig,
  TypedWorkerContext,
  WorkerProcedure,
  QueueJobError,
} from "@alt-stack/workers-core";
import {
  validateInput,
  ProcessingError,
  buildQueueHeaders,
  middlewareMarker,
  normalizeQueueDefinition,
  parseQueueHeaders,
  planFailureAction,
  resolveExecutionConfig,
  resolveWorkerTelemetryConfig,
  shouldIgnoreJob,
  initWorkerTelemetry,
  createJobSpan,
  setSpanOk,
  endSpanWithError,
  setJobStatus,
  JOB_CREATED_AT_HEADER,
  resolveWorkerMetricsConfig,
  shouldIgnoreJobMetrics,
  initWorkerMetrics,
  recordQueueTime,
  recordProcessingTime,
  recordE2ETime,
  calculateQueueTime,
  isErr,
  isOk,
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

interface ExtractedJobInfo {
  jobName: string;
  payload: unknown;
}

/**
 * Create a WarpStream/Kafka worker from a router.
 */
export async function createWorker<TCustomContext extends object = Record<string, never>>(
  router: WorkerRouter<TCustomContext>,
  options: CreateWorkerOptions<TCustomContext>,
): Promise<WorkerResult> {
  const kafka = createKafkaInstance(options.kafka);
  const routing = options.routing ?? DEFAULT_ROUTING;
  const procedures = router.getProcedures();

  const telemetryConfig = resolveWorkerTelemetryConfig(options.telemetry);
  if (telemetryConfig.enabled) {
    await initWorkerTelemetry();
  }

  const metricsConfig = resolveWorkerMetricsConfig(options.metrics);
  if (metricsConfig.enabled) {
    await initWorkerMetrics(metricsConfig);
  }

  const consumer = kafka.consumer({
    ...options.consumerConfig,
    groupId: options.groupId,
  });

  await consumer.connect();

  const topics = getTopicsForRouting(procedures, routing);
  await consumer.subscribe({ topics, fromBeginning: false });

  const procedureMap = buildProcedureMap(procedures);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const jobInfo = extractJobInfo(message, topic, routing);
      const procedure = procedureMap.get(jobInfo.jobName);

      if (!procedure) {
        throw new ProcessingError(`Unknown job: ${jobInfo.jobName}`, { jobName: jobInfo.jobName });
      }

      const queueConfig =
        procedure.type === "queue"
          ? procedure.queueConfig ?? normalizeQueueDefinition(procedure.queue ?? procedure.jobName)
          : undefined;
      const effectiveQueueConfig = queueConfig ?? normalizeQueueDefinition(procedure.queue ?? procedure.jobName);

      const metricCreatedAt = extractCreatedAtValue(message.headers) ?? Date.now().toString();
      const parsedHeaders = parseQueueHeaders(message.headers);
      const executionConfig = resolveExecutionConfig(
        effectiveQueueConfig,
        parsedHeaders
          ? {
              retry: {
                budget: parsedHeaders.retryBudget,
                backoff: {
                  type: parsedHeaders.retryBackoffType,
                  startingSeconds: parsedHeaders.retryBackoffStartingSeconds,
                },
              },
              redrive: parsedHeaders.redriveBudget === undefined
                ? undefined
                : {
                    budget: parsedHeaders.redriveBudget,
                  },
            }
          : undefined,
      );
      const retryConfig = executionConfig.retry;
      const jobId = parsedHeaders?.jobId ?? `${topic}-${partition}-${message.offset}`;
      const attempt = parsedHeaders?.attempt ?? 1;
      const dispatchKind = parsedHeaders?.dispatchKind ?? "initial";
      const queueName = queueConfig?.name ?? parsedHeaders?.queueName ?? procedure.queue ?? topic;
      const createdAtIso = resolveCreatedAtIso(metricCreatedAt);
      const partitionKey = normalizeMessageKey(message.key);
      const retryCount = parsedHeaders?.retryCount ?? 0;
      const retryAttempt = retryCount + 1;
      const redriveBudget = executionConfig.redrive?.budget;
      const redriveCount = parsedHeaders?.redriveCount ?? 0;
      const normalizedHeaders = buildQueueHeaders(
        {
          jobId,
          attempt,
          queueName,
          createdAt: metricCreatedAt,
          dispatchKind,
          scheduledAt: parsedHeaders?.scheduledAt,
          redriveId: parsedHeaders?.redriveId,
          retryBudget: retryConfig.budget,
          retryBackoffType: retryConfig.backoff.type,
          retryBackoffStartingSeconds: retryConfig.backoff.startingSeconds,
          retryCount,
          redriveBudget,
          redriveCount,
        },
        toStringHeaders(message.headers),
      );

      const shouldRecordMetrics = metricsConfig.enabled && !shouldIgnoreJobMetrics(jobInfo.jobName, metricsConfig);
      let createdAtTimestamp: number | null = null;
      const processingStartTime = Date.now();

      if (shouldRecordMetrics) {
        const queueTimeMs = calculateQueueTime(metricCreatedAt);
        if (queueTimeMs !== null) {
          recordQueueTime(jobInfo.jobName, queueTimeMs);
          createdAtTimestamp = Number.parseInt(metricCreatedAt, 10);
        }
      }

      const shouldTrace = telemetryConfig.enabled && !shouldIgnoreJob(jobInfo.jobName, telemetryConfig);
      const span = shouldTrace
        ? createJobSpan(jobInfo.jobName, jobId, attempt, telemetryConfig)
        : undefined;

      const baseCtx: WarpStreamContext = {
        jobId,
        jobName: jobInfo.jobName,
        attempt,
        retryAttempt,
        topic,
        partition,
        offset: message.offset,
        message,
        span,
      };

      const isManagedQueue = options.storage !== undefined && procedure.type === "queue" && queueConfig !== undefined;

      if (isManagedQueue) {
        await options.storage!.append([
          {
            eventId: `${jobId}:started:${attempt}`,
            type: "attempt_started",
            occurredAt: new Date().toISOString(),
            createdAt: createdAtIso,
            jobId,
            jobName: jobInfo.jobName,
            queueName: queueConfig.name,
            attempt,
            payload: jobInfo.payload,
            queue: queueConfig,
            headers: normalizedHeaders,
            key: partitionKey,
            dispatchKind,
            scheduledAt: parsedHeaders?.scheduledAt,
            redriveId: parsedHeaders?.redriveId,
          },
        ]);
      }

      try {
        await executeProcedure(procedure, jobInfo.payload, baseCtx, options);

        if (isManagedQueue) {
          try {
            await options.storage!.append([
              {
                eventId: `${jobId}:succeeded:${attempt}`,
                type: "attempt_succeeded",
                occurredAt: new Date().toISOString(),
                createdAt: createdAtIso,
                jobId,
                jobName: jobInfo.jobName,
                queueName: queueConfig.name,
                attempt,
                payload: jobInfo.payload,
                queue: queueConfig,
                headers: normalizedHeaders,
                key: partitionKey,
                dispatchKind,
                scheduledAt: parsedHeaders?.scheduledAt,
                redriveId: parsedHeaders?.redriveId,
              },
            ]);
          } catch (appendError) {
            await options.onError?.(
              appendError instanceof Error ? appendError : new Error(String(appendError)),
              baseCtx,
            );
          }
        }

        setJobStatus(span, "success");
        setSpanOk(span);
        span?.end();

        if (shouldRecordMetrics) {
          const processingTimeMs = Date.now() - processingStartTime;
          recordProcessingTime(jobInfo.jobName, processingTimeMs, "success");

          if (createdAtTimestamp !== null) {
            const e2eTimeMs = Date.now() - createdAtTimestamp;
            recordE2ETime(jobInfo.jobName, e2eTimeMs, "success");
          }
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));

        if (shouldRecordMetrics) {
          const processingTimeMs = Date.now() - processingStartTime;
          recordProcessingTime(jobInfo.jobName, processingTimeMs, "error");

          if (createdAtTimestamp !== null) {
            const e2eTimeMs = Date.now() - createdAtTimestamp;
            recordE2ETime(jobInfo.jobName, e2eTimeMs, "error");
          }
        }

        if (!isManagedQueue) {
          setJobStatus(span, "error");
          endSpanWithError(span, normalizedError);
          span?.end();
          await options.onError?.(normalizedError, baseCtx);
          throw normalizedError;
        }

        const queueError = serializeError(normalizedError);

        await options.storage!.append([
          {
            eventId: `${jobId}:failed:${attempt}`,
            type: "attempt_failed",
            occurredAt: new Date().toISOString(),
            createdAt: createdAtIso,
            jobId,
            jobName: jobInfo.jobName,
            queueName: queueConfig.name,
            attempt,
            payload: jobInfo.payload,
            queue: queueConfig,
            headers: normalizedHeaders,
            key: partitionKey,
            dispatchKind,
            scheduledAt: parsedHeaders?.scheduledAt,
            redriveId: parsedHeaders?.redriveId,
            error: queueError,
          },
        ]);

        const action = planFailureAction(queueConfig, attempt, queueError, {
          now: new Date(),
          retry: retryConfig,
          retryCount,
          redrive: redriveBudget === undefined ? undefined : { budget: redriveBudget },
          redriveCount,
        });

        if (action.type === "retry") {
          setJobStatus(span, "retry");
          const retryHeaders = buildQueueHeaders(
            {
              jobId,
              attempt: action.nextAttempt,
              queueName: queueConfig.name,
              createdAt: metricCreatedAt,
              dispatchKind: "retry",
              scheduledAt: action.retryAt,
              redriveId: parsedHeaders?.redriveId,
              retryBudget: retryConfig.budget,
              retryBackoffType: retryConfig.backoff.type,
              retryBackoffStartingSeconds: retryConfig.backoff.startingSeconds,
              retryCount: action.nextRetryCount,
              redriveBudget,
              redriveCount,
            },
            normalizedHeaders,
          );
          await options.storage!.append([
            {
              eventId: `${jobId}:retry:${action.nextAttempt}`,
              type: "retry_scheduled",
              occurredAt: new Date().toISOString(),
              createdAt: createdAtIso,
              jobId,
              jobName: jobInfo.jobName,
              queueName: queueConfig.name,
              attempt,
              nextAttempt: action.nextAttempt,
              nextRetryCount: action.nextRetryCount,
              retryAt: action.retryAt,
              payload: jobInfo.payload,
              queue: queueConfig,
              headers: retryHeaders,
              key: partitionKey,
              dispatchKind: "retry",
              scheduledAt: action.retryAt,
              redriveId: parsedHeaders?.redriveId,
              error: queueError,
            },
          ]);
        } else if (action.type === "dead_letter") {
          setJobStatus(span, "error");
          await options.storage!.append([
            {
              eventId: `${jobId}:dlq:${attempt}`,
              type: "moved_to_dlq",
              occurredAt: new Date().toISOString(),
              createdAt: createdAtIso,
              jobId,
              jobName: jobInfo.jobName,
              queueName: queueConfig.name,
              attempt,
              payload: jobInfo.payload,
              queue: queueConfig,
              headers: normalizedHeaders,
              key: partitionKey,
              dispatchKind,
              scheduledAt: parsedHeaders?.scheduledAt,
              redriveId: parsedHeaders?.redriveId,
              error: queueError,
              reason: action.reason,
            },
          ]);
        } else {
          setJobStatus(span, "error");
        }

        endSpanWithError(span, normalizedError);
        span?.end();
        await options.onError?.(normalizedError, baseCtx);
        if (action.type === "failure" && action.rethrow) {
          throw normalizedError;
        }
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

function getTopicsForRouting<TCustomContext extends object>(
  procedures: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[],
  routing: RoutingStrategy,
): string[] {
  if (routing.type === "single-queue") {
    return [routing.topic];
  }

  const prefix = routing.topicPrefix ?? "";
  return procedures.map((procedure) => `${prefix}${procedure.jobName}`);
}

function buildProcedureMap<TCustomContext extends object>(
  procedures: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[],
): Map<
  string,
  WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >
> {
  const map = new Map<
    string,
    WorkerProcedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >
  >();
  for (const procedure of procedures) {
    map.set(procedure.jobName, procedure);
  }
  return map;
}

function extractJobInfo(
  message: KafkaMessage,
  topic: string,
  routing: RoutingStrategy,
): ExtractedJobInfo {
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

  const prefix = routing.topicPrefix ?? "";
  const jobName = topic.startsWith(prefix) ? topic.slice(prefix.length) : topic;
  return { jobName, payload: JSON.parse(value) };
}

async function executeProcedure<TCustomContext extends object>(
  procedure: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >,
  payload: unknown,
  baseCtx: WarpStreamContext,
  options: CreateWorkerOptions<TCustomContext>,
): Promise<void> {
  const validatedInput = await validateInput(procedure.config.input, payload);

  const customContext = options.createContext
    ? await options.createContext(baseCtx)
    : ({} as TCustomContext);

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
      next: async (nextOptions?: { ctx?: unknown }): Promise<MiddlewareResult<unknown>> => {
        if (nextOptions?.ctx) {
          currentCtx = { ...currentCtx, ...(nextOptions.ctx as object) } as ProcedureContext;
        }
        const nextResult = await runMiddleware();
        currentCtx = nextResult;
        return { marker: middlewareMarker, ok: true as const, data: currentCtx };
      },
    });

    if (result && typeof result === "object" && "marker" in result) {
      return currentCtx;
    }
    currentCtx = result as ProcedureContext;
    return currentCtx;
  };

  currentCtx = await runMiddleware();

  const response = await procedure.handler({
    input: currentCtx.input,
    ctx: currentCtx,
  });

  if (isErr(response)) {
    throw response.error;
  }

  if (procedure.config.output && isOk(response) && response.value !== undefined) {
    procedure.config.output.parse(response.value);
  }
}

function extractCreatedAtValue(
  headers: KafkaMessage["headers"],
): string | undefined {
  const createdAtHeader = headers?.[JOB_CREATED_AT_HEADER];
  if (!createdAtHeader) return undefined;
  if (Buffer.isBuffer(createdAtHeader)) {
    return createdAtHeader.toString();
  }
  return typeof createdAtHeader === "string" ? createdAtHeader : undefined;
}

function toStringHeaders(
  headers: KafkaMessage["headers"],
): Record<string, string> {
  if (!headers) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
  }
  return normalized;
}

function normalizeMessageKey(
  key: KafkaMessage["key"],
): string | undefined {
  if (!key) return undefined;
  return Buffer.isBuffer(key) ? key.toString() : String(key);
}

function resolveCreatedAtIso(createdAtHeader: string): string {
  const parsed = Number.parseInt(createdAtHeader, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed).toISOString();
  }

  const date = new Date(createdAtHeader);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function serializeError(error: Error): QueueJobError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}
