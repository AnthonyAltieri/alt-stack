import type { StoredTask } from "./types.js";

export function simulateTaskExecution(
  task: Pick<StoredTask, "title" | "description" | "failAfterRetries" | "alwaysFail">,
  retryAttempt: number,
): string {
  enforceFailureBehavior(task, retryAttempt);

  const details = summarize(task.description ?? "No additional task details provided.");

  return [
    "Task processed",
    `Retry attempt: ${retryAttempt}`,
    `Failure behavior: ${formatFailureBehavior(task)}`,
    `Title: ${task.title.trim()}`,
    `Details: ${details}`,
    `Result: ${buildResult(task.title, task.description)}`,
  ].join("\n");
}

function enforceFailureBehavior(
  task: Pick<StoredTask, "failAfterRetries" | "alwaysFail">,
  retryAttempt: number,
) {
  if (task.alwaysFail) {
    throw new Error("Simulated persistent task failure");
  }

  if (retryAttempt <= task.failAfterRetries) {
    throw new Error("Simulated transient task failure");
  }
}

function buildResult(title: string, description: string | null) {
  const normalizedTitle = title.trim();
  const detailText = description?.trim();

  if (!detailText) {
    return `${normalizedTitle} was processed and marked ready for downstream delivery.`;
  }

  return `${normalizedTitle} was processed with payload "${summarize(detailText, 72)}".`;
}

function summarize(value: string, maxLength = 96) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function formatFailureBehavior(
  task: Pick<StoredTask, "failAfterRetries" | "alwaysFail">,
) {
  if (task.alwaysFail) {
    return "always fail";
  }

  if (task.failAfterRetries === 0) {
    return "success only";
  }

  return task.failAfterRetries === 1
    ? "fail after 1 retry"
    : `fail after ${task.failAfterRetries} retries`;
}
