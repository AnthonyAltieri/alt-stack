import type { Kafka, KafkaConfig, Producer, ProducerConfig, Message, IHeaders } from "kafkajs";
import { Kafka as KafkaClass, CompressionTypes } from "kafkajs";
import type { z } from "zod";
import type { WorkerRouter, WorkerProcedure, InputConfig } from "@alt-stack/workers-core";
import { JOB_CREATED_AT_HEADER } from "@alt-stack/workers-core";
import type {
  CreateJobClientOptions,
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

class WarpStreamJobClient<TRouter extends WorkerRouter<object>> implements JobClient<TRouter> {
  private _producer: Producer;
  private _routing: RoutingStrategy;
  private _procedureMap: Map<string, WorkerProcedure<InputConfig, z.ZodTypeAny | undefined, Record<string, z.ZodTypeAny> | undefined, object>>;
  private _onError?: (error: Error) => void;

  constructor(
    producer: Producer,
    router: TRouter,
    routing: RoutingStrategy,
    onError?: (error: Error) => void,
  ) {
    this._producer = producer;
    this._routing = routing;
    this._onError = onError;
    this._procedureMap = new Map();

    for (const proc of router.getProcedures()) {
      this._procedureMap.set(proc.jobName, proc);
    }
  }

  async enqueue<TJobName extends string>(
    jobName: TJobName,
    payload: unknown,
    options?: EnqueueOptions,
  ): Promise<void> {
    const procedure = this._procedureMap.get(jobName);
    if (!procedure) {
      const error = new Error(`Unknown job: ${jobName}`);
      this._onError?.(error);
      throw error;
    }

    // Validate payload against schema if defined
    if (procedure.config.input?.payload) {
      const result = procedure.config.input.payload.safeParse(payload);
      if (!result.success) {
        const error = new Error(`Invalid payload for job "${jobName}": ${result.error.message}`);
        this._onError?.(error);
        throw error;
      }
    }

    const { topic, value } = this.buildMessage(jobName, payload);

    // Add creation timestamp header for queue time metrics
    const headers: IHeaders = {
      ...options?.headers,
      [JOB_CREATED_AT_HEADER]: Date.now().toString(),
    };

    const kafkaMessage: Message = {
      value,
      key: options?.key ?? null,
      headers,
    };

    try {
      await this._producer.send({
        topic,
        messages: [kafkaMessage],
        compression: CompressionTypes.LZ4,
      });
    } catch (err) {
      const error = new Error(`Failed to enqueue job "${jobName}": ${err instanceof Error ? err.message : String(err)}`);
      this._onError?.(error);
      throw error;
    }
  }

  private buildMessage(jobName: string, payload: unknown): { topic: string; value: string } {
    if (this._routing.type === "single-queue") {
      return {
        topic: this._routing.topic,
        value: JSON.stringify({ jobName, payload }),
      };
    }

    // topic-per-job
    const prefix = this._routing.topicPrefix ?? "";
    return {
      topic: `${prefix}${jobName}`,
      value: JSON.stringify(payload),
    };
  }

  async disconnect(): Promise<void> {
    await this._producer.disconnect();
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
 * // Type-safe: only allows valid job names and payloads
 * await client.enqueue("send-welcome-email", { userId: "123", email: "user@example.com" });
 * ```
 */
export async function createJobClient<TRouter extends WorkerRouter<object>>(
  router: TRouter,
  options: CreateJobClientOptions,
): Promise<JobClient<TRouter>> {
  const kafka = createKafkaInstance(options.kafka, options.clientId);
  const routing = options.routing ?? DEFAULT_ROUTING;

  const producerConfig: ProducerConfig = {
    ...WARPSTREAM_PRODUCER_DEFAULTS,
    ...options.producerConfig,
  };

  const producer = kafka.producer(producerConfig);

  try {
    await producer.connect();
  } catch (err) {
    const error = new Error(`Failed to connect to WarpStream: ${err instanceof Error ? err.message : String(err)}`);
    options.onError?.(error);
    throw error;
  }

  return new WarpStreamJobClient(producer, router, routing, options.onError);
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

