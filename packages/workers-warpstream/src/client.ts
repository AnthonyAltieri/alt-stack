import type { Kafka, KafkaConfig, Producer, ProducerConfig, Message, IHeaders } from "kafkajs";
import { Kafka as KafkaClass, CompressionTypes } from "kafkajs";
import type { z } from "zod";
import type { WorkerRouter, WorkerProcedure, InputConfig } from "@alt-stack/workers-core";
import {
  JOB_CREATED_AT_HEADER,
  buildQueueHeaders,
  createJobId,
  dueDispatchToHeaders,
  normalizeQueueDefinition,
  resolveExecutionConfig,
} from "@alt-stack/workers-core";
import type {
  CreateJobClientOptions,
  DispatchDueJobsOptions,
  DispatchDueJobsResult,
  RoutingStrategy,
  JobClient,
  EnqueueOptions,
} from "./types.js";

/** Default routing strategy */
const DEFAULT_ROUTING: RoutingStrategy = { type: "topic-per-job" };

/** WarpStream-optimized defaults */
const WARPSTREAM_DEFAULTS = {
  connectionTimeout: 10000,
  metadataMaxAge: 60000,
} as const;

const WARPSTREAM_PRODUCER_DEFAULTS: ProducerConfig = {
  metadataMaxAge: 60000,
  allowAutoTopicCreation: false,
};

class WarpStreamJobClient<TRouter extends WorkerRouter<any>> implements JobClient<TRouter> {
  private readonly procedureMap = new Map<
    string,
    WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>
  >();

  constructor(
    private readonly producer: Producer,
    router: TRouter,
    private readonly routing: RoutingStrategy,
    private readonly options: CreateJobClientOptions,
  ) {
    for (const proc of router.getProcedures()) {
      this.procedureMap.set(proc.jobName, proc);
    }
  }

  async enqueue<TJobName extends string>(
    jobName: TJobName,
    payload: unknown,
    options?: EnqueueOptions,
  ): Promise<void> {
    const procedure = this.procedureMap.get(jobName);
    if (!procedure) {
      const error = new Error(`Unknown job: ${jobName}`);
      this.options.onError?.(error);
      throw error;
    }

    if (procedure.config.input?.payload) {
      const result = procedure.config.input.payload.safeParse(payload);
      if (!result.success) {
        const error = new Error(`Invalid payload for job "${jobName}": ${result.error.message}`);
        this.options.onError?.(error);
        throw error;
      }
    }

    const createdAtMs = Date.now().toString();
    const createdAtIso = new Date(Number.parseInt(createdAtMs, 10)).toISOString();
    const jobId = createJobId();
    const queueConfig = procedure.type === "queue"
      ? (procedure.queueConfig ?? normalizeQueueDefinition(procedure.queue ?? jobName))
      : normalizeQueueDefinition(procedure.queue ?? jobName);
    const queueName = queueConfig.name;
    const partitionKey = options?.key;
    const executionConfig = resolveExecutionConfig(queueConfig, options?.config);

    const managedHeaders = buildQueueHeaders(
      {
        jobId,
        attempt: 1,
        queueName,
        createdAt: createdAtMs,
        dispatchKind: "initial",
        retryBudget: executionConfig.retry.budget,
        retryBackoffType: executionConfig.retry.backoff.type,
        retryBackoffStartingSeconds: executionConfig.retry.backoff.startingSeconds,
        retryCount: 0,
        redriveBudget: executionConfig.redrive?.budget,
        redriveCount: 0,
      },
      options?.headers,
    );

    const { topic, value } = buildMessage(jobName, payload, this.routing);
    const kafkaMessage: Message = {
      value,
      key: partitionKey ?? null,
      headers: managedHeaders as IHeaders,
    };

    try {
      await this.producer.send({
        topic,
        messages: [kafkaMessage],
        compression: CompressionTypes.None,
      });

      if (this.options.storage && procedure.type === "queue" && procedure.queueConfig) {
        await this.options.storage.append([
          {
            eventId: `${jobId}:enqueued:1`,
            type: "job_enqueued",
            occurredAt: createdAtIso,
            createdAt: createdAtIso,
            jobId,
            jobName,
            queueName: queueConfig.name,
            attempt: 1,
            payload,
            queue: queueConfig,
            headers: managedHeaders,
            key: partitionKey,
            dispatchKind: "initial",
          },
        ]);
      }
    } catch (err) {
      const error = new Error(
        `Failed to enqueue job "${jobName}": ${err instanceof Error ? err.message : String(err)}`,
      );
      this.options.onError?.(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}

/**
 * Create a type-safe job client for enqueuing jobs.
 *
 * @example
 * ```typescript
 * import { createJobClient } from "@alt-stack/workers-warpstream";
 * import { emailRouter } from "./routers/email";
 *
 * const client = await createJobClient(emailRouter, {
 *   kafka: { brokers: ["warpstream.example.com:9092"] },
 * });
 *
 * await client.enqueue("send-welcome-email", { userId: "123", email: "user@example.com" });
 * ```
 */
export async function createJobClient<TRouter extends WorkerRouter<any>>(
  router: TRouter,
  options: CreateJobClientOptions,
): Promise<JobClient<TRouter>> {
  const kafka = createKafkaInstance(options.kafka, options.clientId);
  const routing = options.routing ?? DEFAULT_ROUTING;
  const producer = await createProducer(kafka, {
    producerConfig: options.producerConfig,
    onError: options.onError,
  });

  return new WarpStreamJobClient(producer, router, routing, options);
}

export async function dispatchDueJobs(
  options: DispatchDueJobsOptions,
): Promise<DispatchDueJobsResult> {
  const kafka = createKafkaInstance(options.kafka, options.clientId);
  const routing = options.routing ?? DEFAULT_ROUTING;
  const producer = await createProducer(kafka, {
    producerConfig: options.producerConfig,
  });
  const dueJobs = await options.storage.listDueDispatches({
    now: options.now,
    limit: options.limit,
  });

  const dispatchedJobIds: string[] = [];

  try {
    for (const dueJob of dueJobs) {
      const headers = buildQueueHeaders(dueDispatchToHeaders(dueJob), dueJob.headers);
      const { topic, value } = buildMessage(dueJob.jobName, dueJob.payload, routing);
      const redriveId = dueJob.redriveId ?? `${dueJob.jobId}:redrive`;

      try {
        await producer.send({
          topic,
          messages: [
            {
              value,
              key: dueJob.key ?? null,
              headers: headers as IHeaders,
            },
          ],
          compression: CompressionTypes.None,
        });

        const createdAtIso = resolveCreatedAtIso(headers[JOB_CREATED_AT_HEADER]);
        const event =
          dueJob.kind === "retry"
            ? {
                eventId: `${dueJob.jobId}:enqueued:${dueJob.attempt}`,
                type: "job_enqueued" as const,
                occurredAt: new Date().toISOString(),
                createdAt: createdAtIso,
                jobId: dueJob.jobId,
                jobName: dueJob.jobName,
                queueName: dueJob.queueName,
                attempt: dueJob.attempt,
                scheduledAt: dueJob.scheduledAt,
                redriveId,
                payload: dueJob.payload,
                queue: dueJob.queue,
                headers,
                key: dueJob.key,
                dispatchKind: "retry" as const,
              }
            : {
                eventId: `${dueJob.jobId}:redrive:${redriveId}`,
                type: "redrive_dispatched" as const,
                occurredAt: new Date().toISOString(),
                createdAt: createdAtIso,
                jobId: dueJob.jobId,
                jobName: dueJob.jobName,
                queueName: dueJob.queueName,
                attempt: dueJob.attempt,
                scheduledAt: dueJob.scheduledAt,
                redriveId,
                payload: dueJob.payload,
                queue: dueJob.queue,
                headers,
                key: dueJob.key,
                dispatchKind: "redrive" as const,
              };

        await options.storage.append([event]);
        dispatchedJobIds.push(dueJob.jobId);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        await options.onError?.(normalizedError, dueJob.jobId);
      }
    }
  } finally {
    await producer.disconnect();
  }

  return {
    dispatched: dispatchedJobIds.length,
    jobIds: dispatchedJobIds,
  };
}

function createKafkaInstance(kafkaOrConfig: Kafka | KafkaConfig, clientId?: string): Kafka {
  if (typeof (kafkaOrConfig as Kafka).producer === "function") {
    return kafkaOrConfig as Kafka;
  }
  const config = kafkaOrConfig as KafkaConfig;
  return new KafkaClass({
    ...config,
    clientId: clientId ?? config.clientId ?? "warpstream-job-client",
    connectionTimeout: config.connectionTimeout ?? WARPSTREAM_DEFAULTS.connectionTimeout,
  });
}

async function createProducer(
  kafka: Kafka,
  options: {
    producerConfig?: ProducerConfig;
    onError?: (error: Error) => void;
  },
): Promise<Producer> {
  const producerConfig: ProducerConfig = {
    ...WARPSTREAM_PRODUCER_DEFAULTS,
    ...options.producerConfig,
  };

  const producer = kafka.producer(producerConfig);

  try {
    await producer.connect();
  } catch (err) {
    const error = new Error(
      `Failed to connect to WarpStream: ${err instanceof Error ? err.message : String(err)}`,
    );
    options.onError?.(error);
    throw error;
  }

  return producer;
}

function buildMessage(
  jobName: string,
  payload: unknown,
  routing: RoutingStrategy,
): { topic: string; value: string } {
  if (routing.type === "single-queue") {
    return {
      topic: routing.topic,
      value: JSON.stringify({ jobName, payload }),
    };
  }

  const prefix = routing.topicPrefix ?? "";
  return {
    topic: `${prefix}${jobName}`,
    value: JSON.stringify(payload),
  };
}

function resolveCreatedAtIso(createdAtHeader: string | undefined): string {
  if (!createdAtHeader) return new Date().toISOString();

  const parsed = Number.parseInt(createdAtHeader, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed).toISOString();
  }

  const date = new Date(createdAtHeader);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
