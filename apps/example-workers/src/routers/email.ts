import { init, ok } from "@alt-stack/workers-trigger";
import { z } from "zod";
import type { AppContext } from "../context.js";

const { router, procedure } = init<AppContext>();

// Create a logged procedure using inline middleware
// The middleware receives the full context including jobName, jobId, etc.
const loggedProcedure = procedure.use(async ({ ctx, next }) => {
  console.log(`[${new Date().toISOString()}] Starting job: ${ctx.jobName}`);
  const start = Date.now();
  const result = await next();
  console.log(`[${new Date().toISOString()}] Finished job: ${ctx.jobName} in ${Date.now() - start}ms`);
  return result;
});

/**
 * Email router with various email-related background jobs.
 */
export const emailRouter = router({
  // On-demand task: Send welcome email
  "send-welcome-email": loggedProcedure
    .input({
      payload: z.object({
        userId: z.string(),
        email: z.string().email(),
        name: z.string(),
      }),
    })
    .output(z.object({ emailId: z.string(), sentAt: z.string() }))
    .task(async ({ input, ctx }) => {
      // Simulate sending email
      const emailId = `email_${Date.now()}`;

      console.log(`Sending welcome email to ${input.email} for user ${input.name}`);

      // Store in our "database"
      ctx.db.emails.set(emailId, {
        to: input.email,
        subject: `Welcome ${input.name}!`,
        sentAt: new Date(),
      });

      return ok({
        emailId,
        sentAt: new Date().toISOString(),
      });
    }),

  // Scheduled task: Daily digest
  "daily-digest": loggedProcedure.cron("0 9 * * *", async ({ ctx }) => {
    console.log("Running daily digest job");

    // Get all users and send digest
    const userCount = ctx.db.users.size;
    console.log(`Would send daily digest to ${userCount} users`);
    return ok();
  }),

  // Queue-based task: Process bulk emails
  "process-bulk-email": loggedProcedure
    .input({
      payload: z.object({
        emails: z.array(z.string().email()),
        templateId: z.string(),
      }),
    })
    .queue("bulk-emails", async ({ input, ctx }) => {
      console.log(`Processing bulk email with template ${input.templateId}`);
      console.log(`Sending to ${input.emails.length} recipients`);

      for (const email of input.emails) {
        const emailId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        ctx.db.emails.set(emailId, {
          to: email,
          subject: `Bulk email - Template ${input.templateId}`,
          sentAt: new Date(),
        });
      }
      return ok();
    }),
});
