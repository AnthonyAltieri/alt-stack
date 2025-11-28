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
 */

// Re-export tasks for Trigger.dev
export * from "./trigger/tasks.js";

// Example of how to trigger tasks from your application code:
// 
// import { tasks } from "@trigger.dev/sdk/v3";
// import type { sendWelcomeEmail } from "./trigger/tasks";
// 
// // Trigger a task
// const handle = await tasks.trigger<typeof sendWelcomeEmail>("send-welcome-email", {
//   userId: "user_123",
//   email: "user@example.com",
//   name: "John Doe",
// });
// 
// console.log("Task triggered:", handle.id);
