/**
 * Trigger.dev task definitions.
 * 
 * This file creates Trigger.dev tasks from our router and exports them
 * for Trigger.dev to discover.
 */
import { createWorker } from "@alt-stack/workers-trigger";
import { appRouter } from "../routers/index.js";
import { createAppContext } from "../context.js";

// Create the worker with our router and context factory
export const { tasks } = createWorker(appRouter, {
  createContext: async (baseCtx) => {
    const appContext = createAppContext();
    
    // You can also use baseCtx.trigger for Trigger.dev utilities
    // like logging: baseCtx.trigger.logger.info("Creating context");
    
    return appContext;
  },
  onError: async (error, ctx) => {
    console.error(`Job ${ctx.jobName} (${ctx.jobId}) failed on attempt ${ctx.attempt}:`, error);
    // In a real app, you'd send to error tracking (Sentry, etc.)
  },
});

// Export individual tasks for Trigger.dev to discover
// Each exported task will be registered with Trigger.dev

// Email tasks
export const sendWelcomeEmail = tasks["send-welcome-email"];
export const dailyDigest = tasks["daily-digest"];
export const processBulkEmail = tasks["process-bulk-email"];

// User tasks
export const syncUser = tasks["sync-user"];
export const cleanupInactiveUsers = tasks["cleanup-inactive-users"];
