import { dispatchDueJobs } from "@alt-stack/workers-warpstream";
import {
  assertKafkaBrokersResolve,
  TASK_ROUTING,
  createKafkaConfig,
  createQueueStateStorage,
  waitForKafkaReady,
  waitForClickHouseReady,
} from "@worker-state/shared";
import { env } from "./env.js";

async function main() {
  const storage = createQueueStateStorage({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    tablePrefix: env.CLICKHOUSE_TABLE_PREFIX,
  });

  await waitForClickHouseReady({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
  });
  await storage.ensureSchema();
  await assertKafkaBrokersResolve(env);
  await waitForKafkaReady(env);

  const tick = async () => {
    const result = await dispatchDueJobs({
      kafka: createKafkaConfig(env),
      storage,
      routing: TASK_ROUTING,
      now: new Date(),
    });

    if (result.dispatched > 0) {
      console.log(`[dispatcher] dispatched ${result.dispatched} due job(s)`);
    }
  };

  await tick();
  const interval = setInterval(() => {
    void tick().catch((error) => {
      console.error(`[dispatcher] ${error instanceof Error ? error.message : String(error)}`);
    });
  }, env.DISPATCH_INTERVAL_MS);

  console.log("Task queue example dispatcher started");

  const shutdown = async () => {
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
