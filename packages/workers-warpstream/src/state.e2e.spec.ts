import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Admin, Kafka } from "kafkajs";
import { z } from "zod";
import { createClickHouseStorage } from "@alt-stack/workers-state-clickhouse";
import { createJobClient, createWorker, dispatchDueJobs, init, ok } from "./index.js";

const E2E_TIMEOUT_MS = 180_000;
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 100;
let clickHouseUsername: string | undefined;
let clickHousePassword: string | undefined;

describe("workers-warpstream queue state e2e", () => {
  let kafka: Kafka | undefined;
  let admin: Admin | undefined;
  let clickHouseUrl = "";
  let tablePrefix = "";

  beforeAll(async () => {
    const kafkaBroker = process.env.QUEUE_STATE_E2E_KAFKA_BROKER;
    const configuredClickHouseUrl = process.env.QUEUE_STATE_E2E_CLICKHOUSE_URL;
    clickHouseUsername = process.env.QUEUE_STATE_E2E_CLICKHOUSE_USER ?? undefined;
    clickHousePassword = process.env.QUEUE_STATE_E2E_CLICKHOUSE_PASSWORD ?? undefined;

    if (!kafkaBroker || !configuredClickHouseUrl) {
      throw new Error(
        "QUEUE_STATE_E2E_KAFKA_BROKER and QUEUE_STATE_E2E_CLICKHOUSE_URL must be set",
      );
    }

    clickHouseUrl = configuredClickHouseUrl;
    tablePrefix = `queue_state_e2e_${Date.now()}`;

    await waitForClickHouseReady(clickHouseUrl);

    kafka = new Kafka({
      brokers: [kafkaBroker],
      retry: {
        retries: 4,
        initialRetryTime: 100,
      },
    });

    admin = kafka.admin();
    await waitForKafkaReady(admin);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    if (admin) {
      await admin.disconnect().catch(() => undefined);
    }
  }, E2E_TIMEOUT_MS);

  it(
    "retries through ClickHouse-backed dispatch and preserves retry metadata",
    async () => {
      const topic = `queue-state-retry-${Date.now()}`;
      await ensureTopic(admin!, topic);

      const storage = createClickHouseStorage({
        url: clickHouseUrl,
        tablePrefix,
        username: clickHouseUsername,
        password: clickHousePassword,
      });
      await storage.ensureSchema();

      const { router, procedure } = init();
      const seenAttempts: number[] = [];
      const routing = { type: "single-queue", topic } as const;

      const workerRouter = router({
        "retry-job": procedure
          .input({ payload: z.object({ fileId: z.string() }) })
          .queue(
            {
              name: "uploads-retry-e2e",
              config: {
                retry: {
                  budget: 1,
                  backoff: {
                    type: "static",
                    startingSeconds: 0,
                  },
                },
              },
            },
            async ({ ctx }) => {
              seenAttempts.push(ctx.attempt);
              if (ctx.attempt === 1) {
                throw new Error("boom");
              }
              return ok();
            },
          ),
      });

      const worker = await createWorker(workerRouter, {
        kafka: kafka!,
        groupId: `queue-state-retry-${Date.now()}`,
        storage,
        routing,
      });
      const client = await createJobClient(workerRouter, {
        kafka: kafka!,
        storage,
        routing,
      });

      try {
        await waitForConsumerReady();
        await client.enqueue(
          "retry-job",
          { fileId: "retry-e2e-1" } as never,
          { key: "tenant-retry" },
        );

        const jobId = await waitForJobId({
          clickHouseUrl,
          tablePrefix,
          jobName: "retry-job",
        });

        await waitForJobState({
          storage,
          jobId,
          predicate: (state) => state?.state === "retry_scheduled",
        });

        const history = await storage.getJob(jobId);
        const retryEvent = history?.events.find((event) => event.type === "retry_scheduled");
        expect(retryEvent && "nextAttempt" in retryEvent ? retryEvent.nextAttempt : null).toBe(2);

        const dueDispatches = await storage.listDueDispatches({
          now: new Date(Date.now() + 1_000),
        });
        const dueDispatch = dueDispatches.find((dispatch) => dispatch.jobId === jobId);
        expect(dueDispatch?.key).toBe("tenant-retry");

        await dispatchDueJobs({
          kafka: kafka!,
          storage,
          routing,
          now: new Date(Date.now() + 1_000),
        });

        const finalState = await waitForJobState({
          storage,
          jobId,
          predicate: (state) => state?.state === "succeeded",
        });

        expect(finalState?.attempt).toBe(2);
        expect(finalState?.key).toBe("tenant-retry");
        expect(seenAttempts).toEqual([1, 2]);
      } finally {
        await client.disconnect();
        await worker.disconnect();
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    "redrives dead-letter jobs without corrupting dead-letter reason state",
    async () => {
      const topic = `queue-state-redrive-${Date.now()}`;
      await ensureTopic(admin!, topic);

      const storage = createClickHouseStorage({
        url: clickHouseUrl,
        tablePrefix,
        username: clickHouseUsername,
        password: clickHousePassword,
      });
      await storage.ensureSchema();

      const { router, procedure } = init();
      let allowSuccess = false;
      const routing = { type: "single-queue", topic } as const;

      const workerRouter = router({
        "redrive-job": procedure
          .input({ payload: z.object({ fileId: z.string() }) })
          .queue(
            {
              name: "uploads-redrive-e2e",
              deadLetter: {
                queueName: "uploads-redrive-e2e-dlq",
              },
            },
            async () => {
              if (!allowSuccess) {
                throw new Error("boom");
              }
              return ok();
            },
          ),
      });

      const worker = await createWorker(workerRouter, {
        kafka: kafka!,
        groupId: `queue-state-redrive-${Date.now()}`,
        storage,
        routing,
      });
      const client = await createJobClient(workerRouter, {
        kafka: kafka!,
        storage,
        routing,
      });

      try {
        await waitForConsumerReady();
        await client.enqueue(
          "redrive-job",
          { fileId: "redrive-e2e-1" } as never,
          { key: "tenant-redrive" },
        );

        const jobId = await waitForJobId({
          clickHouseUrl,
          tablePrefix,
          jobName: "redrive-job",
        });

        const deadLetterState = await waitForJobState({
          storage,
          jobId,
          predicate: (state) => state?.state === "dead_letter",
        });

        expect(deadLetterState?.deadLetterReason?.code).toBe("max_retries_exceeded");
        expect(deadLetterState?.key).toBe("tenant-redrive");

        const record = await storage.requestRedrive({
          jobId,
          requestedBy: "operator@example.com",
          reason: "manual replay",
        });
        expect(record.reason).toBe("manual replay");

        const requestedState = await waitForJobState({
          storage,
          jobId,
          predicate: (state) => state?.state === "redrive_requested",
        });

        expect(requestedState?.deadLetterReason).toBeUndefined();
        expect(requestedState?.key).toBe("tenant-redrive");

        allowSuccess = true;

        await dispatchDueJobs({
          kafka: kafka!,
          storage,
          routing,
          now: new Date(Date.now() + 1_000),
        });

        const finalState = await waitForJobState({
          storage,
          jobId,
          predicate: (state) => state?.state === "succeeded",
        });
        const history = await storage.getJob(jobId);

        expect(finalState?.key).toBe("tenant-redrive");
        expect(
          history?.events.some(
            (event) =>
              event.type === "redrive_requested" && event.reason === "manual replay",
          ),
        ).toBe(true);
        expect(
          history?.events.some(
            (event) =>
              event.type === "redrive_dispatched" && event.key === "tenant-redrive",
          ),
        ).toBe(true);
      } finally {
        await client.disconnect();
        await worker.disconnect();
      }
    },
    E2E_TIMEOUT_MS,
  );
});

async function ensureTopic(admin: Admin, topic: string): Promise<void> {
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
  });
}

async function waitForClickHouseReady(url: string): Promise<void> {
  await waitFor(async () => {
    const response = await fetch(`${url}/ping`, {
      headers: getClickHouseHeaders(),
    });
    if (!response.ok) {
      return false;
    }
    return (await response.text()).trim() === "Ok.";
  });
}

async function waitForKafkaReady(admin: Admin): Promise<void> {
  await waitFor(async () => {
    try {
      await admin.connect();
      return true;
    } catch {
      return false;
    }
  });
}

async function waitForConsumerReady(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function waitForJobId(options: {
  clickHouseUrl: string;
  tablePrefix: string;
  jobName: string;
}): Promise<string> {
  return waitFor(async () => {
    const rows = await clickHouseQuery<{ job_id: string }>(
      options.clickHouseUrl,
      `
SELECT job_id
FROM ${options.tablePrefix}_current FINAL
WHERE job_name = ${escapeString(options.jobName)}
ORDER BY updated_at DESC
LIMIT 1
FORMAT JSONEachRow
      `.trim(),
    );

    return rows[0]?.job_id ?? null;
  });
}

async function waitForJobState(options: {
  storage: ReturnType<typeof createClickHouseStorage>;
  jobId: string;
  predicate: (
    state: Awaited<ReturnType<ReturnType<typeof createClickHouseStorage>["getJobState"]>>,
  ) => boolean;
}): Promise<Awaited<ReturnType<ReturnType<typeof createClickHouseStorage>["getJobState"]>>> {
  return waitFor(async () => {
    const state = await options.storage.getJobState(options.jobId);
    return options.predicate(state) ? state : null;
  });
}

async function clickHouseQuery<T>(url: string, sql: string): Promise<T[]> {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("query", sql);

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: getClickHouseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`ClickHouse query failed (${response.status}): ${await response.text()}`);
  }

  const body = await response.text();
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function waitFor<T>(
  callback: () => Promise<T | null | false>,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await callback();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function escapeString(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function getClickHouseHeaders(): HeadersInit | undefined {
  if (!clickHouseUsername) {
    return undefined;
  }

  const auth = `${clickHouseUsername}:${clickHousePassword ?? ""}`;
  return {
    Authorization: `Basic ${Buffer.from(auth).toString("base64")}`,
  };
}
