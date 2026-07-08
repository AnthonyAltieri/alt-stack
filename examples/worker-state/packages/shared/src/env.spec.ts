import { describe, expect, it, vi } from "vitest";
import {
  assertKafkaBrokersResolve,
  createKafkaConfig,
  ensureKafkaTopicsReady,
  parseApiEnv,
  parseDispatcherEnv,
} from "./env.js";

describe("task queue example env parsing", () => {
  it("parses the API env", () => {
    const env = parseApiEnv({
      PORT_API: "3010",
      NODE_ENV: "development",
      CLICKHOUSE_URL: "http://localhost:8123",
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "",
      CLICKHOUSE_TABLE_PREFIX: "task_queue_example",
      SQLITE_PATH: "./task-queue.db",
      DEFAULT_RETRY_BUDGET: "3",
      DEFAULT_RETRY_BACKOFF_TYPE: "linear",
      DEFAULT_RETRY_BACKOFF_STARTING_SECONDS: "4",
      DEFAULT_REDRIVE_BUDGET: "2",
      KAFKA_BROKERS: "broker-a:9092,broker-b:9092",
      KAFKA_SSL: "true",
    });

    expect(env.PORT_API).toBe(3010);
    expect(env.DEFAULT_RETRY_BUDGET).toBe(3);
    expect(env.DEFAULT_RETRY_BACKOFF_TYPE).toBe("linear");
    expect(env.DEFAULT_RETRY_BACKOFF_STARTING_SECONDS).toBe(4);
    expect(env.DEFAULT_REDRIVE_BUDGET).toBe(2);
    expect(env.KAFKA_SSL).toBe(true);
  });

  it("builds Kafka config with SASL when credentials exist", () => {
    const env = parseDispatcherEnv({
      DISPATCH_INTERVAL_MS: "1000",
      NODE_ENV: "development",
      CLICKHOUSE_URL: "http://localhost:8123",
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "",
      CLICKHOUSE_TABLE_PREFIX: "task_queue_example",
      SQLITE_PATH: "./task-queue.db",
      KAFKA_BROKERS: "broker-a:9092",
      KAFKA_USERNAME: "user",
      KAFKA_PASSWORD: "secret",
      KAFKA_SSL: "true",
    });

    const config = createKafkaConfig(env);

    expect(config.brokers).toEqual(["broker-a:9092"]);
    expect(config.ssl).toBe(true);
    expect(config.sasl).toMatchObject({
      mechanism: "plain",
      username: "user",
      password: "secret",
    });
  });

  it("fails fast with a helpful message when the broker does not resolve", async () => {
    const env = parseDispatcherEnv({
      DISPATCH_INTERVAL_MS: "1000",
      NODE_ENV: "development",
      CLICKHOUSE_URL: "http://localhost:8123",
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "",
      CLICKHOUSE_TABLE_PREFIX: "task_queue_example",
      SQLITE_PATH: "./task-queue.db",
      KAFKA_BROKERS: "kafka:9092",
      KAFKA_SSL: "false",
    });

    await expect(
      assertKafkaBrokersResolve(env, async () => {
        throw new Error("lookup failed");
      }),
    ).rejects.toThrow(
      "Use `kafka:9092` from Docker Compose containers or `localhost:19092` when running the example on the host.",
    );
  });

  it("creates missing Kafka topics before runtime clients subscribe", async () => {
    const env = parseDispatcherEnv({
      DISPATCH_INTERVAL_MS: "1000",
      NODE_ENV: "development",
      CLICKHOUSE_URL: "http://localhost:8123",
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "",
      CLICKHOUSE_TABLE_PREFIX: "task_queue_example",
      SQLITE_PATH: "./task-queue.db",
      KAFKA_BROKERS: "broker-a:9092",
      KAFKA_SSL: "false",
    });

    const admin = {
      connect: vi.fn(async () => undefined),
      createTopics: vi.fn(async () => true),
      disconnect: vi.fn(async () => undefined),
    };

    await ensureKafkaTopicsReady(
      env,
      ["task-queue-example-jobs", " task-queue-example-jobs ", ""],
      () => admin,
    );

    expect(admin.connect).toHaveBeenCalledOnce();
    expect(admin.createTopics).toHaveBeenCalledWith({
      waitForLeaders: true,
      topics: [
        {
          topic: "task-queue-example-jobs",
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });
    expect(admin.disconnect).toHaveBeenCalledOnce();
  });
});
