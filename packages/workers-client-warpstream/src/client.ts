import type { Kafka, Producer, ProducerConfig, Message, IHeaders } from "kafkajs";
import { Kafka as KafkaClass, CompressionTypes } from "kafkajs";
import type { z } from "zod";
import type {
  WorkerClient,
  JobsMap,
  TriggerOptions,
  TriggerResult,
} from "@alt-stack/workers-client-core";
import { ValidationError, TriggerError, ConnectionError } from "@alt-stack/workers-client-core";

/** Header name for job creation timestamp (used for queue time metrics) */
const JOB_CREATED_AT_HEADER = "x-created-at";

/**
 * Options for creating a WarpStream worker client.
 */
export interface WarpStreamClientOptions<T extends JobsMap> {
  /** WarpStream bootstrap server URL (e.g., "my-cluster.warpstream.com:9092") */
  bootstrapServer: string;
  /** Jobs map from AsyncAPI-generated types */
  jobs: T;
  /** Topic prefix for job names (default: "") */
  topicPrefix?: string;
  /** Client identifier */
  clientId?: string;
  /** Override default producer configuration */
  producerConfig?: Partial<ProducerConfig>;
  /** Error callback */
  onError?: (error: Error) => void;
}

/**
 * WarpStream-optimized defaults based on their documentation.
 * @see https://docs.warpstream.com/warpstream/byoc/configure-kafka-client/tuning-for-performance
 */
const WARPSTREAM_DEFAULTS = {
  connectionTimeout: 10000,
  metadataMaxAge: 60000,
} as const;

const WARPSTREAM_PRODUCER_DEFAULTS: ProducerConfig = {
  metadataMaxAge: 60000,
  allowAutoTopicCreation: false,
};

class WarpStreamWorkerClient<T extends JobsMap> implements WorkerClient<T> {
  private _producer: Producer;
  private _jobs: T;
  private _topicPrefix: string;
  private _onError?: (error: Error) => void;

  constructor(
    producer: Producer,
    jobs: T,
    topicPrefix: string,
    onError?: (error: Error) => void,
  ) {
    this._producer = producer;
    this._jobs = jobs;
    this._topicPrefix = topicPrefix;
    this._onError = onError;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  async trigger<K extends keyof T & string>(
    jobName: K,
    payload: z.infer<T[K]>,
    options?: TriggerOptions,
  ): Promise<TriggerResult> {
    const schema = this._jobs[jobName];

    if (schema) {
      const result = schema.safeParse(payload);
      if (!result.success) {
        const error = new ValidationError(
          jobName,
          `Payload validation failed for job "${jobName}": ${result.error.message}`,
          result.error.issues,
        );
        this._onError?.(error);
        throw error;
      }
    }

    const jobId = this.generateJobId();
    const topic = `${this._topicPrefix}${jobName}`;

    // Add creation timestamp header for queue time metrics
    const headers: IHeaders = {
      ...options?.metadata,
      [JOB_CREATED_AT_HEADER]: Date.now().toString(),
    };

    const kafkaMessage: Message = {
      value: JSON.stringify(payload),
      key: options?.idempotencyKey ?? null,
      headers,
    };

    try {
      await this._producer.send({
        topic,
        messages: [kafkaMessage],
        compression: CompressionTypes.LZ4,
      });

      return { id: jobId };
    } catch (err) {
      const error = new TriggerError(
        jobName,
        `Failed to trigger job "${jobName}"`,
        err,
      );
      this._onError?.(error);
      throw error;
    }
  }

  async triggerBatch<K extends keyof T & string>(
    jobName: K,
    payloads: z.infer<T[K]>[],
    options?: TriggerOptions,
  ): Promise<TriggerResult[]> {
    const schema = this._jobs[jobName];

    if (schema) {
      for (let i = 0; i < payloads.length; i++) {
        const result = schema.safeParse(payloads[i]);
        if (!result.success) {
          const error = new ValidationError(
            jobName,
            `Payload validation failed for job "${jobName}" at index ${i}: ${result.error.message}`,
            result.error.issues,
          );
          this._onError?.(error);
          throw error;
        }
      }
    }

    const topic = `${this._topicPrefix}${jobName}`;
    const results: TriggerResult[] = [];

    // Add creation timestamp header for queue time metrics
    const createdAt = Date.now().toString();
    const kafkaMessages: Message[] = payloads.map((payload) => {
      const jobId = this.generateJobId();
      results.push({ id: jobId });
      return {
        value: JSON.stringify(payload),
        key: options?.idempotencyKey ?? null,
        headers: {
          ...options?.metadata,
          [JOB_CREATED_AT_HEADER]: createdAt,
        },
      };
    });

    try {
      await this._producer.send({
        topic,
        messages: kafkaMessages,
        compression: CompressionTypes.LZ4,
      });

      return results;
    } catch (err) {
      const error = new TriggerError(
        jobName,
        `Failed to trigger batch for job "${jobName}"`,
        err,
      );
      this._onError?.(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this._producer.disconnect();
  }
}

/**
 * Create a type-safe worker client optimized for WarpStream.
 *
 * Uses WarpStream-recommended defaults:
 * - LZ4 compression for better throughput
 * - Extended connection timeout (10s)
 * - Extended metadata max age (60s)
 *
 * @example
 * ```typescript
 * import { Topics } from "@org/workers-sdk"; // From zod-asyncapi
 * import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
 *
 * const client = await createWarpStreamClient({
 *   bootstrapServer: "my-cluster.warpstream.com:9092",
 *   jobs: Topics,
 *   clientId: "my-producer",
 * });
 *
 * await client.trigger("send-welcome-email", { userId: "123", email: "user@example.com" });
 * ```
 */
export async function createWarpStreamClient<T extends JobsMap>(
  options: WarpStreamClientOptions<T>,
): Promise<WorkerClient<T>> {
  const kafka: Kafka = new KafkaClass({
    clientId: options.clientId ?? "warpstream-worker-client",
    brokers: [options.bootstrapServer],
    connectionTimeout: WARPSTREAM_DEFAULTS.connectionTimeout,
  });

  const producerConfig: ProducerConfig = {
    ...WARPSTREAM_PRODUCER_DEFAULTS,
    ...options.producerConfig,
  };

  const producer = kafka.producer(producerConfig);

  try {
    await producer.connect();
  } catch (err) {
    const error = new ConnectionError(
      `Failed to connect to WarpStream at ${options.bootstrapServer}`,
      err,
    );
    options.onError?.(error);
    throw error;
  }

  return new WarpStreamWorkerClient(
    producer,
    options.jobs,
    options.topicPrefix ?? "",
    options.onError,
  );
}

