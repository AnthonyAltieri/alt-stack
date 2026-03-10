import { mergeWorkerRouters } from "@alt-stack/workers-trigger";
import { dataPipelineRouter } from "./data-pipeline.js";
import { emailRouter } from "./email.js";
import { userRouter } from "./user.js";

/**
 * Combined router with all worker procedures.
 */
export const appRouter = mergeWorkerRouters(emailRouter, userRouter, dataPipelineRouter);

// Re-export individual routers for direct access
export { dataPipelineRouter, emailRouter, userRouter };
