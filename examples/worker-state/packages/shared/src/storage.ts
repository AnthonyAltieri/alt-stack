import { createClickHouseStorage } from "@alt-stack/workers-state-clickhouse";
import type { ClickHouseStorageOptions } from "@alt-stack/workers-state-clickhouse";

export function createQueueStateStorage(
  options: Pick<
    ClickHouseStorageOptions,
    "url" | "username" | "password" | "tablePrefix"
  >,
) {
  return createClickHouseStorage({
    url: options.url,
    username: options.username,
    password: options.password,
    tablePrefix: options.tablePrefix,
  });
}

export async function waitForClickHouseReady(
  options: Pick<
    ClickHouseStorageOptions,
    "url" | "username" | "password"
  >,
  timeoutMs = 30_000,
): Promise<void> {
  const startedAt = Date.now();
  const headers =
    options.username !== undefined
      ? {
          Authorization: `Basic ${Buffer.from(`${options.username}:${options.password ?? ""}`).toString("base64")}`,
        }
      : undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${options.url}/ping`, { headers });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep retrying until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`ClickHouse did not become ready within ${timeoutMs}ms`);
}
