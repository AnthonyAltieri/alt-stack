import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTaskQueue,
  createTaskRepository,
  type TaskQueueClient,
} from "@worker-state/shared";
import type { Storage } from "@alt-stack/workers-core";
import { createApiApp } from "./app.js";

const createdPaths: string[] = [];

afterEach(() => {
  for (const path of createdPaths.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe("createApiApp", () => {
  it("redirects the root page to the production dashboard", async () => {
    const queue = createTaskQueue();
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({ repository, queueClient, queue, storage });

    const response = await app.request("/");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");

    repository.close();
  });

  it("renders the production dashboard page", async () => {
    const queue = createTaskQueue();
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({ repository, queueClient, queue, storage });

    const response = await app.request("/dashboard");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Production Dashboard");
    expect(body).toContain('href="/demo"');

    repository.close();
  });

  it("redirects the retired ops page to the demo", async () => {
    const queue = createTaskQueue();
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({ repository, queueClient, queue, storage });

    const response = await app.request("/ops");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/demo");

    repository.close();
  });

  it("creates queued tasks through the API", async () => {
    const queue = createTaskQueue({
      retry: {
        budget: 1,
        backoff: {
          type: "static",
          startingSeconds: 2,
        },
      },
      redrive: {
        budget: 1,
      },
    });
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({
      repository,
      queueClient,
      queue,
      storage,
    });

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Generate digest",
        description: "Summarize the morning incidents",
        failAfterRetries: 1,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.title).toBe("Generate digest");
    expect(body.jobId).toBe("job_123");
    expect(body.failAfterRetries).toBe(1);
    expect(body.alwaysFail).toBe(false);
    expect(body.retryBudget).toBe(1);
    expect(body.retryBackoffType).toBe("static");
    expect(body.retryBackoffStartingSeconds).toBe(2);
    expect(body.redriveBudget).toBe(1);
    expect(queueClient.enqueueTask).toHaveBeenCalledTimes(1);
    expect(queueClient.enqueueTask).toHaveBeenCalledWith(
      { taskId: body.id },
      body.id,
      {
        config: {
          retry: {
            budget: 1,
            backoff: {
              type: "static",
              startingSeconds: 2,
            },
          },
          redrive: {
            budget: 1,
          },
        },
      },
    );

    repository.close();
  });

  it("lets the enqueue request override the default redrive budget", async () => {
    const queue = createTaskQueue({
      retry: {
        budget: 1,
        backoff: {
          type: "static",
          startingSeconds: 2,
        },
      },
      redrive: {
        budget: 1,
      },
    });
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({
      repository,
      queueClient,
      queue,
      storage,
    });

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Generate digest",
        alwaysFail: true,
        config: {
          redrive: {
            budget: 0,
          },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.redriveBudget).toBe(0);
    expect(queueClient.enqueueTask).toHaveBeenCalledWith(
      { taskId: body.id },
      body.id,
      {
        config: {
          retry: {
            budget: 1,
            backoff: {
              type: "static",
              startingSeconds: 2,
            },
          },
          redrive: {
            budget: 0,
          },
        },
      },
    );

    repository.close();
  });

  it("prefers queue-state redrive budget data when presenting tasks", async () => {
    const queue = createTaskQueue();
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub({
      getJobState: vi.fn(async () => ({
        jobId: "job_123",
        jobName: "process-demo-task",
        queueName: "demo-tasks",
        state: "dead_letter",
        attempt: 2,
        createdAt: "2026-04-08T18:00:00.000Z",
        updatedAt: "2026-04-08T18:00:05.000Z",
        payload: { taskId: "task_123" },
        queue: {
          name: "demo-tasks",
          config: {
            retry: {
              budget: 0,
              backoff: {
                type: "static",
                startingSeconds: 0,
              },
            },
            redrive: {
              budget: 1,
            },
          },
        },
        headers: {},
        dispatchKind: "redrive",
        retryBudget: 0,
        retryBackoffType: "static",
        retryBackoffStartingSeconds: 0,
        retryCount: 0,
        deadLetterReason: {
          code: "redrive_failed",
          message: "Job failed again after a redrive",
        },
        redriveBudget: 1,
        redriveCount: 1,
      })),
    });
    const app = createApiApp({ repository, queueClient, queue, storage });

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Replay poisoned event",
        alwaysFail: true,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.redriveBudget).toBe(1);
    expect(body.redriveCount).toBe(1);
    expect(body.redriveRemaining).toBe(0);
    expect(body.canRedrive).toBe(false);

    repository.close();
  });

  it("requests redrives from the ops endpoint", async () => {
    const queue = createTaskQueue();
    const repository = createTaskRepository(createTempPath());
    const queueClient: TaskQueueClient = {
      enqueueTask: vi.fn(async () => ({ jobId: "job_123" })),
      disconnect: vi.fn(async () => undefined),
    };
    const storage = createStorageStub();
    const app = createApiApp({ repository, queueClient, queue, storage });

    const response = await app.request("/api/ops/jobs/job_123/redrive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "manual replay" }),
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(storage.requestRedrive).toHaveBeenCalledWith({
      jobId: "job_123",
      requestedBy: "task-queue-example-ops",
      reason: "manual replay",
    });
    expect(body.reason).toBe("manual replay");

    repository.close();
  });
});

function createStorageStub(
  overrides: Partial<
    Pick<Storage, "getJobState" | "listDeadLetters" | "listRedrives" | "requestRedrive">
  > = {},
): Pick<
  Storage,
  "getJobState" | "listDeadLetters" | "listRedrives" | "requestRedrive"
> & { requestRedrive: ReturnType<typeof vi.fn> } {
  return {
    getJobState: vi.fn(async () => null),
    listDeadLetters: vi.fn(async () => []),
    listRedrives: vi.fn(async () => []),
    requestRedrive: vi.fn(async (request) => ({
      jobId: request.jobId,
      queueName: "demo-tasks",
      jobName: "process-demo-task",
      redriveId: "redrive_123",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 1,
      requestedAt: new Date().toISOString(),
      requestedBy: request.requestedBy,
      reason: request.reason,
    })),
    ...overrides,
  };
}

function createTempPath(): string {
  const path = join(tmpdir(), `task-api-example-${Date.now()}-${Math.random()}.db`);
  createdPaths.push(path);
  return path;
}
