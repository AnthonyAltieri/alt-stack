import type { Kafka, KafkaConfig, ConsumerConfig, ProducerConfig, KafkaMessage } from "kafkajs";
import type { BaseWorkerContext, WorkerRouter } from "@alt-stack/workers-core";

/** Routing strategy for job distribution */
export type RoutingStrategy =
  | { type: "topic-per-job"; topicPrefix?: string }
  | { type: "single-queue"; topic: string };

/** Extended context with WarpStream/Kafka metadata */
export interface WarpStreamContext extends BaseWorkerContext {
  /** Kafka topic the message was received from */
  topic: string;
  /** Partition number */
  partition: number;
  /** Message offset */
  offset: string;
  /** Raw Kafka message */
  message: KafkaMessage;
}

/** Options for createWorker */
export interface CreateWorkerOptions<TCustomContext extends object = Record<string, never>> {
  /** Kafka instance or config for WarpStream connection */
  kafka: Kafka | KafkaConfig;
  /** Consumer group ID */
  groupId: string;
  /** Routing strategy - defaults to topic-per-job */
  routing?: RoutingStrategy;
  /** Override default consumer config */
  consumerConfig?: Omit<ConsumerConfig, "groupId">;
  /** Create custom context for each job execution */
  createContext?: (baseCtx: WarpStreamContext) => Promise<TCustomContext> | TCustomContext;
  /** Error handler */
  onError?: (error: Error, ctx: WarpStreamContext) => void | Promise<void>;
}

/** Options for createJobClient */
export interface CreateJobClientOptions {
  /** Kafka instance or config for WarpStream connection */
  kafka: Kafka | KafkaConfig;
  /** Routing strategy - must match consumer */
  routing?: RoutingStrategy;
  /** Override default producer config */
  producerConfig?: ProducerConfig;
  /** Client ID */
  clientId?: string;
  /** Error callback */
  onError?: (error: Error) => void;
}

/** Result of createWorker */
export interface WorkerResult {
  /** Disconnect the consumer */
  disconnect: () => Promise<void>;
}

/** Infer job names from a router */
export type InferJobNames<TRouter> = TRouter extends WorkerRouter<infer _TCtx>
  ? ReturnType<TRouter["getProcedures"]>[number]["jobName"]
  : never;

/** Infer payload type for a specific job */
export type InferJobPayload<TRouter, TJobName extends string> =
  TRouter extends WorkerRouter<infer _TCtx>
    ? Extract<
        ReturnType<TRouter["getProcedures"]>[number],
        { jobName: TJobName }
      > extends { config: { input: { payload: infer TPayload } } }
      ? TPayload extends import("zod").ZodTypeAny
        ? import("zod").infer<TPayload>
        : undefined
      : undefined
    : undefined;

/** Type-safe job client */
export interface JobClient<TRouter extends WorkerRouter<object>> {
  /** Enqueue a job */
  enqueue<TJobName extends InferJobNames<TRouter>>(
    jobName: TJobName,
    payload: InferJobPayload<TRouter, TJobName>,
    options?: EnqueueOptions,
  ): Promise<void>;
  /** Disconnect the producer */
  disconnect: () => Promise<void>;
}

/** Options for enqueuing a job */
export interface EnqueueOptions {
  /** Partition key */
  key?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

