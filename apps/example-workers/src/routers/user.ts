import { init, ok } from "@alt-stack/workers-trigger";
import { z } from "zod";
import type { AppContext } from "../context.js";

const { router, procedure } = init<AppContext>();

/**
 * User router with user-related background jobs.
 */
export const userRouter = router({
  // Sync user data from external source
  "sync-user": procedure
    .input({
      payload: z.object({
        userId: z.string(),
        source: z.enum(["crm", "billing", "support"]),
      }),
    })
    .task(async ({ input, ctx }) => {
      console.log(`Syncing user ${input.userId} from ${input.source}`);

      // Simulate fetching and updating user data
      const existingUser = ctx.db.users.get(input.userId);
      if (existingUser) {
        console.log(`Updated user ${existingUser.name} with data from ${input.source}`);
      } else {
        console.log(`User ${input.userId} not found, creating...`);
        ctx.db.users.set(input.userId, {
          id: input.userId,
          email: `user_${input.userId}@example.com`,
          name: `User ${input.userId}`,
        });
      }
      return ok(undefined);
    }),

  // Cleanup inactive users (scheduled)
  "cleanup-inactive-users": procedure.cron("0 2 * * 0", async ({ ctx }) => {
    // Run every Sunday at 2 AM
    console.log("Running inactive user cleanup");
    console.log(`Checking ${ctx.db.users.size} users for inactivity...`);
    // In a real app, you'd check last login dates, etc.
    return ok(undefined);
  }),
});
