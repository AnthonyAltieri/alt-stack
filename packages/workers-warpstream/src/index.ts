// Re-export everything from workers-core
export * from "@alt-stack/workers-core";

// Export WarpStream-specific functionality
export { createWorker } from "./worker.js";
export { createJobClient, dispatchDueJobs } from "./client.js";

// Export types
export type {
  WarpStreamContext,
  CreateWorkerOptions,
  CreateJobClientOptions,
  WorkerResult,
  RoutingStrategy,
  JobClient,
  EnqueueOptions,
  DispatchDueJobsOptions,
  DispatchDueJobsResult,
  InferJobNames,
  InferJobPayload,
} from "./types.js";
