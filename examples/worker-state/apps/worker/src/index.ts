import { createWorker } from "@alt-stack/workers-warpstream";
import {
  assertKafkaBrokersResolve,
  TASK_ROUTING,
  createTaskWorkerRouter,
  createTaskRepository,
  createKafkaConfig,
  createQueueStateStorage,
  ensureKafkaTopicsReady,
  waitForKafkaReady,
  waitForClickHouseReady,
} from "@worker-state/shared";
import { env } from "./env.js";

async function main() {
  const defaultTaskConfig = {
    retry: {
      budget: env.DEFAULT_RETRY_BUDGET,
      backoff: {
        type: env.DEFAULT_RETRY_BACKOFF_TYPE,
        startingSeconds: env.DEFAULT_RETRY_BACKOFF_STARTING_SECONDS,
      },
    },
    ...(env.DEFAULT_REDRIVE_BUDGET === undefined
      ? {}
      : {
          redrive: {
            budget: env.DEFAULT_REDRIVE_BUDGET,
          },
        }),
  };
  const repository = createTaskRepository(env.SQLITE_PATH);
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
  await ensureKafkaTopicsReady(env, [TASK_ROUTING.topic]);
  const taskWorkerRouter = createTaskWorkerRouter(defaultTaskConfig);

  const worker = await createWorker(taskWorkerRouter, {
    kafka: createKafkaConfig(env),
    groupId: env.KAFKA_GROUP_ID,
    routing: TASK_ROUTING,
    storage,
    createContext: async () => ({
      repo: repository,
    }),
    onError: async (error, ctx) => {
      console.error(
        `[worker] job ${ctx.jobName} (${ctx.jobId}) failed on attempt ${ctx.attempt}: ${error.message}`,
      );
    },
  });

  console.log("Task queue example worker started");

  const shutdown = async () => {
    await worker.disconnect();
    repository.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
