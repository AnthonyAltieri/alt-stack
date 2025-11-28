import { mergeWorkerRouters } from "@alt-stack/workers-trigger";
import { emailRouter } from "./email.js";
import { userRouter } from "./user.js";

/**
 * Combined router with all worker procedures.
 */
export const appRouter = mergeWorkerRouters(emailRouter, userRouter);

// Re-export individual routers for direct access
export { emailRouter, userRouter };
