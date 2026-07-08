import {
  resolveExecutionConfig,
  type NormalizedQueueDefinition,
  type QueueDefinition,
  type QueueExecutionConfig,
} from "@alt-stack/workers-core";

export const TASK_TOPIC = "task-queue-example-jobs";
export const TASK_JOB_NAME = "process-demo-task";

export const TASK_ROUTING = {
  type: "single-queue",
  topic: TASK_TOPIC,
} as const;

const TASK_QUEUE_BASE: QueueDefinition = {
  name: "demo-tasks",
  config: {
    retry: {
      budget: 0,
      backoff: {
        type: "static",
        startingSeconds: 0,
      },
    },
  },
  deadLetter: {
    queueName: "demo-tasks-dlq",
  },
};

export function createTaskQueue(config?: QueueExecutionConfig): NormalizedQueueDefinition {
  return {
    ...TASK_QUEUE_BASE,
    config: resolveExecutionConfig(TASK_QUEUE_BASE, config),
  };
}

export const TASK_QUEUE: NormalizedQueueDefinition = createTaskQueue();

export const DEFAULT_CLICKHOUSE_TABLE_PREFIX = "task_queue_example";
