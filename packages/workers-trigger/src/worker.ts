import { task, schemaTask, schedules } from "@trigger.dev/sdk/v3";
import type { Context } from "@trigger.dev/sdk/v3";
import type { z } from "zod";
import type {
  WorkerRouter,
  InputConfig,
  TypedWorkerContext,
  WorkerProcedure,
} from "@alt-stack/workers-core";
import {
  validateInput,
  ProcessingError,
  middlewareMarker,
} from "@alt-stack/workers-core";
import type { MiddlewareResult } from "@alt-stack/workers-core";
import type { TriggerContext, CreateWorkerOptions, WorkerResult } from "./types.js";

/**
 * Create Trigger.dev tasks from a worker router.
 *
 * @example
 * ```typescript
 * import { createWorker } from "@alt-stack/workers-trigger";
 * import { emailRouter } from "./routers/email";
 *
 * export const { tasks } = createWorker(emailRouter, {
 *   createContext: async (baseCtx) => ({
 *     db: getDb(),
 *     logger: baseCtx.trigger.logger,
 *   }),
 * });
 *
 * // Export individual tasks for Trigger.dev
 * export const sendWelcomeEmail = tasks["send-welcome-email"];
 * export const dailyDigest = tasks["daily-digest"];
 * ```
 */
export function createWorker<TCustomContext extends object = Record<string, never>>(
  router: WorkerRouter<TCustomContext>,
  options?: CreateWorkerOptions<TCustomContext>,
): WorkerResult {
  const procedures = router.getProcedures();
  const createdTasks: Record<string, unknown> = {};

  for (const procedure of procedures) {
    const taskDef = createTaskFromProcedure(procedure, options);
    createdTasks[procedure.jobName] = taskDef;
  }

  return { tasks: createdTasks };
}

/**
 * Creates a run handler that executes procedure middleware and handler
 */
function createRunHandler<TCustomContext extends object>(
  procedure: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >,
  options?: CreateWorkerOptions<TCustomContext>,
) {
  return async (payload: unknown, params: { ctx: Context }) => {
    const ctx = params.ctx;
    const baseCtx: TriggerContext = {
      jobId: ctx.run.id,
      jobName: procedure.jobName,
      attempt: ctx.attempt.number,
      trigger: ctx,
    };

    try {
      // Validate input
      const validatedInput = await validateInput(procedure.config.input, payload);

      // Create custom context
      const customContext = options?.createContext
        ? await options.createContext(baseCtx)
        : ({} as TCustomContext);

      // Build error function
      const errorFn = (error: unknown): never => {
        if (!procedure.config.errors) {
          throw new ProcessingError("Error occurred", error);
        }

        for (const [_code, schema] of Object.entries(procedure.config.errors)) {
          const result = (schema as z.ZodTypeAny).safeParse(error);
          if (result.success) {
            const errorResponse = result.data;
            throw new ProcessingError(
              typeof errorResponse === "object" &&
              errorResponse !== null &&
              "message" in errorResponse &&
              typeof errorResponse.message === "string"
                ? errorResponse.message
                : "Error occurred",
              errorResponse,
            );
          }
        }

        throw new ProcessingError("Error occurred", error);
      };

      type ProcedureContext = TypedWorkerContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >;

      let currentCtx: ProcedureContext = {
        ...customContext,
        ...baseCtx,
        input: validatedInput,
        error: procedure.config.errors ? errorFn : (undefined as never),
      } as ProcedureContext;

      // Run middleware chain
      let middlewareIndex = 0;

      const runMiddleware = async (): Promise<ProcedureContext> => {
        if (middlewareIndex >= procedure.middleware.length) {
          return currentCtx;
        }
        const middleware = procedure.middleware[middlewareIndex++];
        if (!middleware) {
          return currentCtx;
        }
        const result = await middleware({
          ctx: currentCtx,
          next: async (opts?: { ctx?: unknown }): Promise<MiddlewareResult<unknown>> => {
            if (opts?.ctx) {
              currentCtx = { ...currentCtx, ...(opts.ctx as object) } as ProcedureContext;
            }
            const nextResult = await runMiddleware();
            currentCtx = nextResult;
            return { marker: middlewareMarker, ok: true as const, data: currentCtx };
          },
        });

        // Handle MiddlewareResult
        if (result && typeof result === "object" && "marker" in result) {
          return currentCtx;
        }
        currentCtx = result as ProcedureContext;
        return currentCtx;
      };

      currentCtx = await runMiddleware();

      // Run handler
      const response = await procedure.handler({
        input: currentCtx.input,
        ctx: currentCtx,
      });

      // Validate output if schema provided
      if (procedure.config.output && response !== undefined) {
        procedure.config.output.parse(response);
      }

      return response;
    } catch (error) {
      if (options?.onError) {
        await options.onError(
          error instanceof Error ? error : new Error(String(error)),
          baseCtx,
        );
      }
      throw error;
    }
  };
}

function createTaskFromProcedure<TCustomContext extends object>(
  procedure: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >,
  options?: CreateWorkerOptions<TCustomContext>,
): unknown {
  const hasPayloadSchema = procedure.config.input?.payload !== undefined;
  const runHandler = createRunHandler(procedure, options);

  // Create the appropriate task type based on procedure type
  switch (procedure.type) {
    case "cron": {
      // Use schedules.task for cron jobs
      // Note: scheduled tasks receive ScheduledTaskPayload, not custom payload
      return schedules.task({
        id: procedure.jobName,
        cron: procedure.cron?.pattern ?? "0 * * * *",
        run: async (scheduledPayload, params) => {
          // For cron jobs, we pass the scheduled payload info
          return runHandler(scheduledPayload, params);
        },
      });
    }

    case "task":
    case "queue":
    default: {
      // Use schemaTask if we have a payload schema, otherwise use task
      if (hasPayloadSchema) {
        return schemaTask({
          id: procedure.jobName,
          schema: procedure.config.input.payload!,
          run: async (payload, params) => {
            return runHandler(payload, params);
          },
        });
      }
      return task({
        id: procedure.jobName,
        run: async (payload: unknown, params: { ctx: Context }) => {
          return runHandler(payload, params);
        },
      });
    }
  }
}
