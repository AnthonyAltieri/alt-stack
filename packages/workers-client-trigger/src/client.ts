import { tasks } from "@trigger.dev/sdk/v3";
import type { z } from "zod";
import type {
  WorkerClient,
  JobsMap,
  TriggerOptions,
  TriggerResult,
} from "@alt-stack/workers-client-core";
import { ValidationError, TriggerError } from "@alt-stack/workers-client-core";

/**
 * Options for creating a Trigger.dev client.
 */
export interface TriggerClientOptions<T extends JobsMap> {
  /** Jobs map from AsyncAPI-generated types */
  jobs: T;
  /** Error callback */
  onError?: (error: Error) => void;
}

class TriggerClient<T extends JobsMap> implements WorkerClient<T> {
  private _jobs: T;
  private _onError?: (error: Error) => void;

  constructor(jobs: T, onError?: (error: Error) => void) {
    this._jobs = jobs;
    this._onError = onError;
  }

  async trigger<K extends keyof T & string>(
    jobName: K,
    payload: z.infer<T[K]>,
    options?: TriggerOptions,
  ): Promise<TriggerResult> {
    const schema = this._jobs[jobName];

    if (schema) {
      const result = schema.safeParse(payload);
      if (!result.success) {
        const error = new ValidationError(
          jobName,
          `Payload validation failed for job "${jobName}": ${result.error.message}`,
          result.error.issues,
        );
        this._onError?.(error);
        throw error;
      }
    }

    try {
      const handle = await tasks.trigger(jobName, payload, {
        idempotencyKey: options?.idempotencyKey,
        delay: options?.delay,
      });

      return { id: handle.id };
    } catch (err) {
      const error = new TriggerError(
        jobName,
        `Failed to trigger job "${jobName}"`,
        err,
      );
      this._onError?.(error);
      throw error;
    }
  }

  async triggerBatch<K extends keyof T & string>(
    jobName: K,
    payloads: z.infer<T[K]>[],
    options?: TriggerOptions,
  ): Promise<TriggerResult[]> {
    const schema = this._jobs[jobName];

    if (schema) {
      for (let i = 0; i < payloads.length; i++) {
        const result = schema.safeParse(payloads[i]);
        if (!result.success) {
          const error = new ValidationError(
            jobName,
            `Payload validation failed for job "${jobName}" at index ${i}: ${result.error.message}`,
            result.error.issues,
          );
          this._onError?.(error);
          throw error;
        }
      }
    }

    try {
      const handles = await tasks.batchTrigger(
        jobName,
        payloads.map((payload) => ({
          payload,
          options: {
            idempotencyKey: options?.idempotencyKey,
            delay: options?.delay,
          },
        })),
      );

      return handles.runs.map((run) => ({ id: run.id }));
    } catch (err) {
      const error = new TriggerError(
        jobName,
        `Failed to trigger batch for job "${jobName}"`,
        err,
      );
      this._onError?.(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // No-op for Trigger.dev - no persistent connection
  }
}

/**
 * Create a type-safe worker client for Trigger.dev.
 *
 * @example
 * ```typescript
 * import { Topics } from "@org/workers-sdk"; // From zod-asyncapi
 * import { createTriggerClient } from "@alt-stack/workers-client-trigger";
 *
 * const client = createTriggerClient({ jobs: Topics });
 *
 * await client.trigger("send-welcome-email", { userId: "123", email: "user@example.com" });
 * ```
 */
export function createTriggerClient<T extends JobsMap>(
  options: TriggerClientOptions<T>,
): WorkerClient<T> {
  return new TriggerClient(options.jobs, options.onError);
}

