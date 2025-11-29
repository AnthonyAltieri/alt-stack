/**
 * Example Workers Application
 *
 * This demonstrates how to use @alt-stack/workers-trigger to create
 * type-safe background jobs with Trigger.dev.
 *
 * To run:
 * 1. Set up Trigger.dev in your project (npx trigger init)
 * 2. Run `pnpm dev` to start the Trigger.dev dev server
 *
 * The tasks are defined in src/trigger/tasks.ts and will be automatically
 * discovered by Trigger.dev.
 *
 * ## Task Types
 *
 * - **On-demand tasks** (.task): Triggered programmatically
 * - **Scheduled tasks** (.cron): Run on a schedule
 * - **Queue tasks** (.queue): Process messages from named queues
 *
 * ## Triggering Tasks
 *
 * See src/examples/enqueue-pipeline.ts for comprehensive examples of:
 * - Single task triggers
 * - Batch triggers
 * - Chained pipelines
 * - Idempotency keys
 * - Delayed execution
 * - Parallel processing
 */

// Re-export tasks for Trigger.dev
export * from "./trigger/tasks.js";

// Re-export enqueue examples
export * from "./examples/enqueue-pipeline.js";

/**
 * Quick example: Trigger a task from your application code
 *
 * @example
 * ```typescript
 * import { tasks } from "@trigger.dev/sdk/v3";
 * import type { sendWelcomeEmail } from "example-workers";
 *
 * // Trigger a task
 * const handle = await tasks.trigger<typeof sendWelcomeEmail>("send-welcome-email", {
 *   userId: "user_123",
 *   email: "user@example.com",
 *   name: "John Doe",
 * });
 *
 * console.log("Task triggered:", handle.id);
 * ```
 *
 * @example
 * ```typescript
 * import { tasks } from "@trigger.dev/sdk/v3";
 * import type { importCsvData } from "example-workers";
 *
 * // Trigger a data pipeline import
 * const handle = await tasks.trigger<typeof importCsvData>("import-csv-data", {
 *   sourceUrl: "https://example.com/data.csv",
 *   batchSize: 100,
 *   records: [{ id: "1", data: { name: "Test" } }],
 * });
 * ```
 */
