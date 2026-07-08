import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskRepository } from "./db.js";

const createdPaths: string[] = [];

afterEach(() => {
  for (const path of createdPaths.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe("TaskRepository", () => {
  it("creates queued tasks and tracks their job records", () => {
    const repository = createTaskRepository(createTempPath());
    const task = repository.createTask({
      title: "Generate nightly digest",
      description: "Summarize the latest support tickets",
      failAfterRetries: 1,
      alwaysFail: false,
      retryBudget: 2,
      retryBackoffType: "linear",
      retryBackoffStartingSeconds: 3,
      redriveBudget: 1,
    });

    repository.attachJobToTask(task.id, "job_123");
    repository.completeTask(task.id, "Digest generated");

    const storedTask = repository.getTask(task.id);
    const jobRecords = repository.listTaskJobRecords();

    expect(storedTask?.result).toBe("Digest generated");
    expect(storedTask?.processingStatus).toBe("completed");
    expect(storedTask?.retryBudget).toBe(2);
    expect(storedTask?.retryBackoffType).toBe("linear");
    expect(storedTask?.retryBackoffStartingSeconds).toBe(3);
    expect(storedTask?.redriveBudget).toBe(1);
    expect(storedTask?.failAfterRetries).toBe(1);
    expect(storedTask?.alwaysFail).toBe(false);
    expect(jobRecords[0]?.jobId).toBe("job_123");
    expect(jobRecords[0]?.failAfterRetries).toBe(1);
    expect(jobRecords[0]?.alwaysFail).toBe(false);
    expect(jobRecords[0]?.retryBudget).toBe(2);
    expect(jobRecords[0]?.redriveBudget).toBe(1);

    repository.close();
  });
});

function createTempPath(): string {
  const path = join(tmpdir(), `task-queue-example-${Date.now()}-${Math.random()}.db`);
  createdPaths.push(path);
  return path;
}
