import type { Kafka, Producer, ProducerConfig, KafkaConfig, Message } from "kafkajs";
import { Kafka as KafkaClass } from "kafkajs";
import type { z } from "zod";
import type { KafkaRouter } from "./router.js";

// ============================================================================
// Types
// ============================================================================

export interface CreateProducerOptions {
  kafka: Kafka | KafkaConfig;
  producerConfig?: ProducerConfig;
  onError?: (error: Error) => void;
}

export interface TypedProducer<TTopicMap extends Record<string, z.ZodTypeAny>> {
  /**
   * Send a message to a topic with type-safe payload
   */
  send<TTopic extends keyof TTopicMap & string>(
    topic: TTopic,
    message: z.infer<TTopicMap[TTopic]>,
    options?: SendOptions,
  ): Promise<void>;

  /**
   * Send multiple messages to a topic
   */
  sendBatch<TTopic extends keyof TTopicMap & string>(
    topic: TTopic,
    messages: Array<z.infer<TTopicMap[TTopic]>>,
    options?: SendOptions,
  ): Promise<void>;

  /**
   * Disconnect the producer
   */
  disconnect(): Promise<void>;

  /**
   * Get the underlying KafkaJS producer
   */
  readonly producer: Producer;
}

export interface SendOptions {
  key?: string | Buffer | null;
  partition?: number;
  headers?: Record<string, string | Buffer>;
  timestamp?: string;
}

// ============================================================================
// Type Helpers
// ============================================================================

type ExtractTopicMap<TRouter> = TRouter extends KafkaRouter<any, infer TTopicMap>
  ? TTopicMap
  : never;

// ============================================================================
// Producer Implementation
// ============================================================================

class TypedProducerImpl<TTopicMap extends Record<string, z.ZodTypeAny>>
  implements TypedProducer<TTopicMap>
{
  private _producer: Producer;
  private _topicSchemas: Map<string, z.ZodTypeAny | undefined>;
  private _onError?: (error: Error) => void;

  constructor(
    producer: Producer,
    router: KafkaRouter<any, any>,
    onError?: (error: Error) => void,
  ) {
    this._producer = producer;
    this._onError = onError;
    this._topicSchemas = new Map();

    // Build topic -> schema map
    const procedures = router.getProcedures();
    for (const procedure of procedures) {
      this._topicSchemas.set(procedure.topic, procedure.config.input?.message);
    }
  }

  get producer(): Producer {
    return this._producer;
  }

  async send<TTopic extends keyof TTopicMap & string>(
    topic: TTopic,
    message: z.infer<TTopicMap[TTopic]>,
    options?: SendOptions,
  ): Promise<void> {
    const schema = this._topicSchemas.get(topic);

    // Validate message against schema
    if (schema) {
      const result = schema.safeParse(message);
      if (!result.success) {
        const error = new Error(
          `Message validation failed for topic "${topic}": ${result.error.message}`,
        );
        if (this._onError) {
          this._onError(error);
        }
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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this._onError) {
        this._onError(err);
      }
      throw err;
    }
  }

  async sendBatch<TTopic extends keyof TTopicMap & string>(
    topic: TTopic,
    messages: Array<z.infer<TTopicMap[TTopic]>>,
    options?: SendOptions,
  ): Promise<void> {
    const schema = this._topicSchemas.get(topic);

    // Validate all messages
    if (schema) {
      for (let i = 0; i < messages.length; i++) {
        const result = schema.safeParse(messages[i]);
        if (!result.success) {
          const error = new Error(
            `Message validation failed for topic "${topic}" at index ${i}: ${result.error.message}`,
          );
          if (this._onError) {
            this._onError(error);
          }
          throw error;
        }
      }
    }

    const kafkaMessages: Message[] = messages.map((message) => ({
      value: JSON.stringify(message),
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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this._onError) {
        this._onError(err);
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this._producer.disconnect();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

function createKafka(config: KafkaConfig): Kafka {
  return new KafkaClass(config);
}

export async function createProducer<TRouter extends KafkaRouter<any, any>>(
  router: TRouter,
  options: CreateProducerOptions,
): Promise<TypedProducer<ExtractTopicMap<TRouter>>> {
  const kafkaInstance =
    typeof (options.kafka as Kafka).producer === "function"
      ? (options.kafka as Kafka)
      : createKafka(options.kafka as KafkaConfig);

  const producer = kafkaInstance.producer(options.producerConfig);
  await producer.connect();

  return new TypedProducerImpl<ExtractTopicMap<TRouter>>(producer, router, options.onError);
}

