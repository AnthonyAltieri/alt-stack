import type { Kafka, KafkaConfig, Message, Producer, ProducerConfig } from "kafkajs";
import { CompressionTypes, Kafka as KafkaClass } from "kafkajs";
import {
  buildQueueHeaders,
  createJobId,
  resolveExecutionConfig,
  type NormalizedQueueDefinition,
  type Storage,
  type QueueExecutionConfig,
} from "@alt-stack/workers-core";
import { TASK_JOB_NAME, TASK_QUEUE, TASK_ROUTING } from "./constants.js";
import type { TaskQueuePayload } from "./types.js";

export interface TaskQueueClient {
  enqueueTask(
    payload: TaskQueuePayload,
    partitionKey: string,
    options?: {
      config?: QueueExecutionConfig;
    },
  ): Promise<{ jobId: string }>;
  disconnect(): Promise<void>;
}

const PRODUCER_DEFAULTS: ProducerConfig = {
  allowAutoTopicCreation: true,
  metadataMaxAge: 60_000,
};

export async function createTaskQueueClient(options: {
  kafka: Kafka | KafkaConfig;
  storage: Storage;
  queue?: NormalizedQueueDefinition;
  producerConfig?: ProducerConfig;
}): Promise<TaskQueueClient> {
  const kafka = isKafkaInstance(options.kafka)
    ? options.kafka
    : new KafkaClass({
        ...options.kafka,
        clientId: options.kafka.clientId ?? "task-queue-example-api",
      });

  const producer = kafka.producer({
    ...PRODUCER_DEFAULTS,
    ...options.producerConfig,
  });

  await producer.connect();

  return new KafkaTaskQueueClient(producer, options.storage, options.queue ?? TASK_QUEUE);
}

class KafkaTaskQueueClient implements TaskQueueClient {
  constructor(
    private readonly producer: Producer,
    private readonly storage: Storage,
    private readonly queue: NormalizedQueueDefinition,
  ) {}

  async enqueueTask(
    payload: TaskQueuePayload,
    partitionKey: string,
    options?: {
      config?: QueueExecutionConfig;
    },
  ): Promise<{ jobId: string }> {
    const createdAtMs = Date.now().toString();
    const createdAtIso = new Date(Number.parseInt(createdAtMs, 10)).toISOString();
    const jobId = createJobId();
    const executionConfig = resolveExecutionConfig(this.queue, options?.config);
    const headers = buildQueueHeaders({
      jobId,
      attempt: 1,
      queueName: this.queue.name,
      createdAt: createdAtMs,
      dispatchKind: "initial",
      retryBudget: executionConfig.retry.budget,
      retryBackoffType: executionConfig.retry.backoff.type,
      retryBackoffStartingSeconds: executionConfig.retry.backoff.startingSeconds,
      retryCount: 0,
      redriveBudget: executionConfig.redrive?.budget,
      redriveCount: 0,
    });

    const message: Message = {
      key: partitionKey,
      value: JSON.stringify({
        jobName: TASK_JOB_NAME,
        payload,
      }),
      headers,
    };

    await this.producer.send({
      topic: TASK_ROUTING.topic,
      messages: [message],
      compression: CompressionTypes.None,
    });

    await this.storage.append([
      {
        eventId: `${jobId}:enqueued:1`,
        type: "job_enqueued",
        occurredAt: createdAtIso,
        createdAt: createdAtIso,
        jobId,
        jobName: TASK_JOB_NAME,
        queueName: this.queue.name,
        attempt: 1,
        payload,
        queue: this.queue,
        headers,
        key: partitionKey,
        dispatchKind: "initial",
      },
    ]);

    return { jobId };
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}

function isKafkaInstance(candidate: Kafka | KafkaConfig): candidate is Kafka {
  return typeof (candidate as Kafka).producer === "function";
}
