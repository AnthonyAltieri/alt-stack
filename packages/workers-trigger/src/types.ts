import type { Context } from "@trigger.dev/sdk/v3";
import type { BaseWorkerContext } from "@alt-stack/workers-core";

/**
 * Extended context that includes Trigger.dev specific context.
 */
export interface TriggerContext extends BaseWorkerContext {
  /** The Trigger.dev task context with utilities for logging, waiting, etc. */
  trigger: Context;
}

/**
 * Options for creating a Trigger.dev worker.
 */
export interface CreateWorkerOptions<TCustomContext extends object = Record<string, never>> {
  /**
   * Create custom context for each job execution.
   * Receives the base context with Trigger.dev context included.
   */
  createContext?: (baseCtx: TriggerContext) => Promise<TCustomContext> | TCustomContext;

  /**
   * Error handler for job failures.
   */
  onError?: (error: Error, ctx: TriggerContext) => void | Promise<void>;
}

/**
 * Result of creating a worker - contains all the Trigger.dev tasks.
 */
export interface WorkerResult {
  /** All created tasks, keyed by job name */
  tasks: Record<string, unknown>;
}
