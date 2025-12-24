import { createWorker, init, workerRouter, ok } from "@alt-stack/workers-warpstream";
import { z } from "zod";

// ============================================================================
// Job Definitions
// ============================================================================

const { procedure } = init();

export const jobRouter = workerRouter({
  "send-notification": procedure
    .input({
      payload: z.object({
        type: z.enum(["task_created", "task_completed", "task_assigned"]),
        userId: z.string(),
        taskId: z.string(),
        taskTitle: z.string(),
      }),
    })
    .task(async ({ input }) => {
      console.log(`[Notification] ${input.type} for user ${input.userId}`);
      console.log(`  Task: ${input.taskTitle} (${input.taskId})`);
      // In production: send email, push notification, etc.
      return ok({ success: true });
    }),

  "generate-report": procedure
    .input({
      payload: z.object({
        taskId: z.string(),
        userId: z.string(),
        completedAt: z.string().datetime(),
      }),
    })
    .task(async ({ input }) => {
      console.log(`[Report] Generating report for task ${input.taskId}`);
      console.log(`  Completed at: ${input.completedAt}`);
      console.log(`  User: ${input.userId}`);
      // In production: generate PDF, store in S3, etc.
      return ok({ success: true });
    }),
});

export type JobRouter = typeof jobRouter;

// ============================================================================
// Worker Startup
// ============================================================================

const WARPSTREAM_URL = process.env.WARPSTREAM_URL || "localhost:9092";
const GROUP_ID = process.env.GROUP_ID || "real-life-workers";

async function main() {
  console.log(`Starting workers, connecting to ${WARPSTREAM_URL}...`);

  const worker = await createWorker(jobRouter, {
    kafka: { brokers: [WARPSTREAM_URL] },
    groupId: GROUP_ID,
  });

  console.log("Workers running, waiting for jobs...");

  const shutdown = async () => {
    console.log("Shutting down...");
    await worker.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch(console.error);

