import { serve } from "@hono/node-server";
import {
  assertKafkaBrokersResolve,
  createTaskQueue,
  createTaskRepository,
  createKafkaConfig,
  createQueueStateStorage,
  createTaskQueueClient,
  waitForKafkaReady,
  waitForClickHouseReady,
} from "@worker-state/shared";
import { createApiApp } from "./app.js";
import { env } from "./env.js";

async function main() {
  const queue = createTaskQueue({
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
  });
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

  const queueClient = await createTaskQueueClient({
    kafka: createKafkaConfig(env),
    storage,
    queue,
  });

  const app = createApiApp({
    repository,
    queueClient,
    queue,
    storage,
  });

  const server = serve({
    fetch: app.fetch,
    port: env.PORT_API,
  });

  console.log(`Task queue example API running at http://localhost:${env.PORT_API}`);

  const shutdown = async () => {
    await queueClient.disconnect();
    repository.close();
    server.close();
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
