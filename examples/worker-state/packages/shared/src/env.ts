import { createEnv } from "@t3-oss/env-core";
import { lookup } from "node:dns/promises";
import { Kafka as KafkaClass } from "kafkajs";
import type { KafkaConfig, SASLOptions } from "kafkajs";
import { z } from "zod";
import { DEFAULT_CLICKHOUSE_TABLE_PREFIX } from "./constants.js";

type RuntimeEnv = Record<string, string | undefined>;
type KafkaTopicDefinition = {
  topic: string;
  numPartitions?: number;
  replicationFactor?: number;
};
type KafkaAdmin = {
  connect(): Promise<void>;
  createTopics(options: {
    waitForLeaders?: boolean;
    topics: KafkaTopicDefinition[];
  }): Promise<boolean>;
  disconnect(): Promise<void>;
};

const nodeEnvSchema = z.enum(["development", "production", "test"]).default("development");
const portSchema = z
  .string()
  .default("3005")
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().positive());
const intervalSchema = z
  .string()
  .default("1000")
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().positive());
const optionalNonNegativeIntSchema = z.string().optional().transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected a non-negative integer",
    });
    return z.NEVER;
  }

  return parsed;
});
const nonNegativeIntSchema = z
  .string()
  .default("0")
  .transform((value, ctx) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected a non-negative integer",
      });
      return z.NEVER;
    }

    return parsed;
  });
const retryBackoffTypeSchema = z.enum(["static", "linear", "exponential"]).default("static");

const clickHouseSchema = {
  CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default("task-example-clickhouse"),
  CLICKHOUSE_TABLE_PREFIX: z.string().default(DEFAULT_CLICKHOUSE_TABLE_PREFIX),
} as const;

const kafkaSchema = {
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .default("kafka:9092")
    .describe("Comma-separated list of Kafka bootstrap brokers"),
  KAFKA_USERNAME: z.string().optional(),
  KAFKA_PASSWORD: z.string().optional(),
  KAFKA_SSL: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
} as const;

const commonSchema = {
  NODE_ENV: nodeEnvSchema,
  SQLITE_PATH: z.string().default("./task-queue-example.db"),
  DEFAULT_RETRY_BUDGET: nonNegativeIntSchema,
  DEFAULT_RETRY_BACKOFF_TYPE: retryBackoffTypeSchema,
  DEFAULT_RETRY_BACKOFF_STARTING_SECONDS: nonNegativeIntSchema,
  DEFAULT_REDRIVE_BUDGET: optionalNonNegativeIntSchema,
  ...clickHouseSchema,
  ...kafkaSchema,
} as const;

export function parseApiEnv(runtimeEnv: RuntimeEnv) {
  return createEnv({
    server: {
      PORT_API: portSchema,
      ...commonSchema,
    },
    runtimeEnv,
    skipValidation: runtimeEnv.SKIP_ENV_VALIDATION === "true",
    emptyStringAsUndefined: true,
  });
}

export function parseWorkerEnv(runtimeEnv: RuntimeEnv) {
  return createEnv({
    server: {
      KAFKA_GROUP_ID: z.string().default("task-queue-example-workers"),
      ...commonSchema,
    },
    runtimeEnv,
    skipValidation: runtimeEnv.SKIP_ENV_VALIDATION === "true",
    emptyStringAsUndefined: true,
  });
}

export function parseDispatcherEnv(runtimeEnv: RuntimeEnv) {
  return createEnv({
    server: {
      DISPATCH_INTERVAL_MS: intervalSchema,
      ...commonSchema,
    },
    runtimeEnv,
    skipValidation: runtimeEnv.SKIP_ENV_VALIDATION === "true",
    emptyStringAsUndefined: true,
  });
}

export function createKafkaConfig(
  env: Pick<
    ReturnType<typeof parseApiEnv>,
    "KAFKA_BROKERS" | "KAFKA_USERNAME" | "KAFKA_PASSWORD" | "KAFKA_SSL"
  >,
): KafkaConfig {
  const brokers = parseKafkaBrokers(env.KAFKA_BROKERS);

  const config: KafkaConfig = {
    brokers,
    ssl: env.KAFKA_SSL,
  };

  if (env.KAFKA_USERNAME && env.KAFKA_PASSWORD) {
    const sasl: SASLOptions = {
      mechanism: "plain",
      username: env.KAFKA_USERNAME,
      password: env.KAFKA_PASSWORD,
    };
    config.sasl = sasl;
  }

  return config;
}

type BrokerLookup = (hostname: string) => Promise<unknown>;

export async function assertKafkaBrokersResolve(
  env: Pick<ReturnType<typeof parseApiEnv>, "KAFKA_BROKERS">,
  brokerLookup: BrokerLookup = lookup,
) {
  const brokers = parseKafkaBrokers(env.KAFKA_BROKERS);
  const unresolvedHosts: string[] = [];

  for (const broker of brokers) {
    const hostname = broker.replace(/:\d+$/, "");

    try {
      await brokerLookup(hostname);
    } catch {
      unresolvedHosts.push(hostname);
    }
  }

  if (unresolvedHosts.length === 0) {
    return;
  }

  throw new Error(
    [
      `The configured Kafka broker host${unresolvedHosts.length === 1 ? "" : "s"} could not be resolved.`,
      "Use `kafka:9092` from Docker Compose containers or `localhost:19092` when running the example on the host.",
    ].join(" "),
  );
}

export async function waitForKafkaReady(
  env: Pick<
    ReturnType<typeof parseApiEnv>,
    "KAFKA_BROKERS" | "KAFKA_USERNAME" | "KAFKA_PASSWORD" | "KAFKA_SSL"
  >,
  timeoutMs = 30_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const kafka = new KafkaClass({
      ...createKafkaConfig(env),
      clientId: "task-queue-example-readiness",
    });
    const admin = kafka.admin();

    try {
      await admin.connect();
      await admin.disconnect();
      return;
    } catch {
      await admin.disconnect().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Kafka did not become ready within ${timeoutMs}ms`);
}

export async function ensureKafkaTopicsReady(
  env: Pick<
    ReturnType<typeof parseApiEnv>,
    "KAFKA_BROKERS" | "KAFKA_USERNAME" | "KAFKA_PASSWORD" | "KAFKA_SSL"
  >,
  topics: string[],
  createAdmin: () => KafkaAdmin = () => {
    const kafka = new KafkaClass({
      ...createKafkaConfig(env),
      clientId: "task-queue-example-topic-bootstrap",
    });
    return kafka.admin();
  },
): Promise<void> {
  const topicDefinitions = [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))]
    .map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    }));

  if (topicDefinitions.length === 0) {
    return;
  }

  const admin = createAdmin();

  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: topicDefinitions,
    });
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

function parseKafkaBrokers(rawValue: string) {
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
