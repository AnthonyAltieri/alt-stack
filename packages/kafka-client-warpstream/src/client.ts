import type { Kafka, Producer, ProducerConfig, Message } from "kafkajs";
import { Kafka as KafkaClass, CompressionTypes } from "kafkajs";
import type { z } from "zod";
import type { KafkaClient, TopicsMap, SendOptions } from "@alt-stack/kafka-client-core";
import { ValidationError, SendError, ConnectionError } from "@alt-stack/kafka-client-core";

/**
 * Options for creating a WarpStream client.
 */
export interface WarpStreamClientOptions<T extends TopicsMap> {
  /** WarpStream bootstrap server URL (e.g., "my-cluster.warpstream.com:9092") */
  bootstrapServer: string;
  /** Topics map from AsyncAPI-generated types */
  topics: T;
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

class WarpStreamClient<T extends TopicsMap> implements KafkaClient<T, Producer> {
  private _producer: Producer;
  private _topics: T;
  private _onError?: (error: Error) => void;

  constructor(producer: Producer, topics: T, onError?: (error: Error) => void) {
    this._producer = producer;
    this._topics = topics;
    this._onError = onError;
  }

  /**
   * Access the underlying KafkaJS Producer for advanced use cases.
   */
  get producer(): Producer {
    return this._producer;
  }

  async send<K extends keyof T & string>(
    topic: K,
    message: z.infer<T[K]>,
    options?: SendOptions,
  ): Promise<void> {
    const schema = this._topics[topic];

    if (schema) {
      const result = schema.safeParse(message);
      if (!result.success) {
        const error = new ValidationError(
          topic,
          `Message validation failed for topic "${topic}": ${result.error.message}`,
          result.error.issues,
        );
        this._onError?.(error);
        throw error;
      }
    }

    const kafkaMessage: Message = {
      value: JSON.stringify(message),
      key: options?.key ?? null,
      partition: options?.partition,
      headers: options?.headers,
      timestamp: options?.timestamp,
    };

    try {
      await this._producer.send({
        topic,
        messages: [kafkaMessage],
        compression: CompressionTypes.LZ4,
      });
    } catch (err) {
      const error = new SendError(topic, `Failed to send message to topic "${topic}"`, err);
      this._onError?.(error);
      throw error;
    }
  }

  async sendBatch<K extends keyof T & string>(
    topic: K,
    messages: z.infer<T[K]>[],
    options?: SendOptions,
  ): Promise<void> {
    const schema = this._topics[topic];

    if (schema) {
      for (let i = 0; i < messages.length; i++) {
        const result = schema.safeParse(messages[i]);
        if (!result.success) {
          const error = new ValidationError(
            topic,
            `Message validation failed for topic "${topic}" at index ${i}: ${result.error.message}`,
            result.error.issues,
          );
          this._onError?.(error);
          throw error;
        }
      }
    }

    const kafkaMessages: Message[] = messages.map((msg) => ({
      value: JSON.stringify(msg),
      key: options?.key ?? null,
      partition: options?.partition,
      headers: options?.headers,
      timestamp: options?.timestamp,
    }));

    try {
      await this._producer.send({
        topic,
        messages: kafkaMessages,
        compression: CompressionTypes.LZ4,
      });
    } catch (err) {
      const error = new SendError(topic, `Failed to send batch to topic "${topic}"`, err);
      this._onError?.(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this._producer.disconnect();
  }
}

/**
 * Create a type-safe Kafka client optimized for WarpStream.
 *
 * Uses WarpStream-recommended defaults:
 * - LZ4 compression for better throughput
 * - Extended connection timeout (10s)
 * - Extended metadata max age (60s)
 *
 * @example
 * ```typescript
 * import { Topics } from "./generated-types"; // From zod-asyncapi
 * import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";
 *
 * const client = await createWarpStreamClient({
 *   bootstrapServer: "my-cluster.warpstream.com:9092",
 *   topics: Topics,
 *   clientId: "my-producer",
 * });
 *
 * await client.send("user-events", { userId: "123", eventType: "created" });
 * ```
 */
export async function createWarpStreamClient<T extends TopicsMap>(
  options: WarpStreamClientOptions<T>,
): Promise<KafkaClient<T, Producer>> {
  const kafka: Kafka = new KafkaClass({
    clientId: options.clientId ?? "warpstream-client",
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

  return new WarpStreamClient(producer, options.topics, options.onError);
}
