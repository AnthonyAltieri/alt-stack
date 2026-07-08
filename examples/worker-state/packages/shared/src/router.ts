import { init, ok, type QueueExecutionConfig } from "@alt-stack/workers-warpstream";
import { z } from "zod";
import { simulateTaskExecution } from "./assistant.js";
import { TASK_JOB_NAME, TASK_QUEUE, createTaskQueue } from "./constants.js";
import type { TaskRepository } from "./db.js";
import { taskQueuePayloadSchema } from "./types.js";

export interface TaskWorkerContext {
  repo: TaskRepository;
}

const { router, procedure } = init<TaskWorkerContext>();

const taskExecutionOutputSchema = z.object({
  taskId: z.string(),
  result: z.string(),
});

export function createTaskWorkerRouter(defaultConfig?: QueueExecutionConfig) {
  const taskQueue = defaultConfig === undefined
    ? TASK_QUEUE
    : createTaskQueue(defaultConfig);

  return router({
    [TASK_JOB_NAME]: procedure
      .input({
        payload: taskQueuePayloadSchema,
      })
      .output(taskExecutionOutputSchema)
      .queue(taskQueue, async ({ input, ctx }) => {
        const task = ctx.repo.getTask(input.taskId);

        if (!task) {
          throw new Error(`Task ${input.taskId} was not found`);
        }

        const result = simulateTaskExecution(task, ctx.retryAttempt);
        ctx.repo.completeTask(task.id, result);

        return ok({
          taskId: task.id,
          result,
        });
      }),
  });
}

export const taskWorkerRouter = createTaskWorkerRouter();
