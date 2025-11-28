import type { Kafka, Producer, ProducerConfig, KafkaConfig, Message } from "kafkajs";
import { Kafka as KafkaClass } from "kafkajs";
import type { z } from "zod";
import type { KafkaClient, TopicsMap, SendOptions } from "@alt-stack/kafka-client-core";
import { ValidationError, SendError, ConnectionError } from "@alt-stack/kafka-client-core";

/**
 * Options for creating a KafkaJS client.
 */
export interface KafkaJSClientOptions<T extends TopicsMap> {
  /** KafkaJS instance or configuration */
  kafka: Kafka | KafkaConfig;
  /** Topics map from AsyncAPI-generated types */
  topics: T;
  /** Optional producer configuration */
  producerConfig?: ProducerConfig;
  /** Error callback */
  onError?: (error: Error) => void;
}

class KafkaJSClient<T extends TopicsMap> implements KafkaClient<T, Producer> {
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

function createKafkaInstance(config: KafkaConfig): Kafka {
  return new KafkaClass(config);
}

/**
 * Create a type-safe Kafka client using KafkaJS.
 *
 * @example
 * ```typescript
 * import { Topics } from "./generated-types"; // From zod-asyncapi
 * import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";
 *
 * const client = await createKafkaClient({
 *   kafka: { brokers: ["localhost:9092"], clientId: "my-app" },
 *   topics: Topics,
 * });
 *
 * await client.send("user-events", { userId: "123", eventType: "created" });
 * ```
 */
export async function createKafkaClient<T extends TopicsMap>(
  options: KafkaJSClientOptions<T>,
): Promise<KafkaClient<T, Producer>> {
  const kafkaInstance =
    typeof (options.kafka as Kafka).producer === "function"
      ? (options.kafka as Kafka)
      : createKafkaInstance(options.kafka as KafkaConfig);

  const producer = kafkaInstance.producer(options.producerConfig);

  try {
    await producer.connect();
  } catch (err) {
    const error = new ConnectionError("Failed to connect to Kafka", err);
    options.onError?.(error);
    throw error;
  }

  return new KafkaJSClient(producer, options.topics, options.onError);
}
