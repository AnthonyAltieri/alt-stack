import { createDocsRouter, createServer, init, router } from "@alt-stack/server-hono";
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { serve } from "@hono/node-server";
import type { Context } from "hono";
import ky from "ky";
import { z } from "zod";
import { Topics } from "@real-life/workers-sdk";

// ============================================================================
// Types
// ============================================================================

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
  userId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

interface AppContext {
  userId: string | null;
}

// ============================================================================
// In-Memory Store
// ============================================================================

interface StoredTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const tasks = new Map<string, StoredTask>();

// ============================================================================
// Auth Validation (calls backend-auth)
// ============================================================================

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";

async function validateToken(token: string): Promise<string | null> {
  try {
    const res = await ky
      .get(`${AUTH_SERVICE_URL}/api/validate`, {
        headers: { authorization: token },
      })
      .json<{ valid: boolean; userId?: string }>();
    return res.valid ? (res.userId ?? null) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Worker Client
// ============================================================================

const WARPSTREAM_URL = process.env.WARPSTREAM_URL || "localhost:9092";

const workerClient = await createWarpStreamClient({
  bootstrapServer: WARPSTREAM_URL,
  jobs: Topics,
});

// ============================================================================
// Procedures
// ============================================================================

const factory = init<AppContext>();

const protectedProc = factory.procedure
  .errors({
    401: z.object({ error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }) }),
  })
  .use(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw ctx.error({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    return next({ ctx: { userId: ctx.userId } });
  });

const taskRouter = router<AppContext>({
  "/": {
    get: factory.procedure.output(z.array(TaskSchema)).handler(() => {
      return Array.from(tasks.values()).map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    }),

    post: protectedProc
      .input({
        body: z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
        }),
      })
      .output(TaskSchema)
      .handler(async ({ input, ctx }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const task: StoredTask = {
          id,
          title: input.body.title,
          description: input.body.description,
          status: "pending",
          userId: ctx.userId,
          createdAt: now,
          updatedAt: now,
        };
        tasks.set(id, task);

        // Trigger notification worker
        await workerClient.trigger("send-notification", {
          type: "task_created",
          userId: ctx.userId,
          taskId: id,
          taskTitle: input.body.title,
        });

        return {
          ...task,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        };
      }),
  },

  "{id}": {
    get: factory.procedure
      .input({ params: z.object({ id: z.string().uuid() }) })
      .output(TaskSchema)
      .errors({
        404: z.object({ error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }) }),
      })
      .handler(({ input, ctx }) => {
        const task = tasks.get(input.params.id);
        if (!task) {
          throw ctx.error({ error: { code: "NOT_FOUND", message: "Task not found" } });
        }
        return {
          ...task,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        };
      }),

    put: protectedProc
      .input({
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(1000).optional(),
          status: z.enum(["pending", "in_progress", "completed"]).optional(),
        }),
      })
      .output(TaskSchema)
      .errors({
        404: z.object({ error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }) }),
        403: z.object({ error: z.object({ code: z.literal("FORBIDDEN"), message: z.string() }) }),
      })
      .handler(async ({ input, ctx }) => {
        const task = tasks.get(input.params.id);
        if (!task) {
          throw ctx.error({ error: { code: "NOT_FOUND", message: "Task not found" } });
        }
        if (task.userId !== ctx.userId) {
          throw ctx.error({ error: { code: "FORBIDDEN", message: "Not your task" } });
        }

        const wasCompleted = task.status === "completed";
        const nowCompleted = input.body.status === "completed";

        task.title = input.body.title ?? task.title;
        task.description = input.body.description ?? task.description;
        task.status = input.body.status ?? task.status;
        task.updatedAt = new Date();

        // Trigger report generation when task is completed
        if (!wasCompleted && nowCompleted) {
          await workerClient.trigger("generate-report", {
            taskId: task.id,
            userId: ctx.userId,
            completedAt: task.updatedAt.toISOString(),
          });
        }

        return {
          ...task,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        };
      }),

    delete: protectedProc
      .input({ params: z.object({ id: z.string().uuid() }) })
      .output(z.object({ success: z.boolean() }))
      .errors({
        404: z.object({ error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }) }),
        403: z.object({ error: z.object({ code: z.literal("FORBIDDEN"), message: z.string() }) }),
      })
      .handler(({ input, ctx }) => {
        const task = tasks.get(input.params.id);
        if (!task) {
          throw ctx.error({ error: { code: "NOT_FOUND", message: "Task not found" } });
        }
        if (task.userId !== ctx.userId) {
          throw ctx.error({ error: { code: "FORBIDDEN", message: "Not your task" } });
        }
        tasks.delete(input.params.id);
        return { success: true };
      }),
  },
});

// ============================================================================
// Server
// ============================================================================

async function createContext(c: Context): Promise<AppContext> {
  const auth = c.req.header("Authorization");
  const userId = auth ? await validateToken(auth) : null;
  return { userId };
}

const docsRouter = createDocsRouter({ api: taskRouter }, { title: "Tasks API", version: "1.0.0" });
const app = createServer<AppContext>({ api: taskRouter, docs: docsRouter }, { createContext });

export { taskRouter };
export default app;

const port = Number(process.env.PORT) || 3002;
console.log(`Logic service running at http://localhost:${port}`);
console.log(`OpenAPI docs at http://localhost:${port}/docs/openapi.json`);
serve({ fetch: app.fetch, port });
