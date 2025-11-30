# Logic Service

The business logic service handles task management and triggers background workers.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/` | List all tasks |
| POST | `/api/` | Create task (auth required) |
| GET | `/api/{id}` | Get task by ID |
| PUT | `/api/{id}` | Update task (auth required) |
| DELETE | `/api/{id}` | Delete task (auth required) |

## Auth Integration

The service validates tokens by calling the auth service:

```typescript
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";

async function validateToken(token: string): Promise<string | null> {
  try {
    const res = await ky.get(`${AUTH_SERVICE_URL}/api/validate`, {
      headers: { authorization: token },
    }).json<{ valid: boolean; userId?: string }>();
    return res.valid ? (res.userId ?? null) : null;
  } catch {
    return null;
  }
}

// Context creation
async function createContext(c: Context): Promise<AppContext> {
  const auth = c.req.header("Authorization");
  const userId = auth ? await validateToken(auth) : null;
  return { userId };
}
```

## Protected Procedures

```typescript
interface AppContext {
  userId: string | null;
}

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
```

## Worker Triggers

When tasks are created or completed, the service triggers background workers:

```typescript
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "@real-life/workers-sdk";

const workerClient = await createWarpStreamClient({
  bootstrapServer: WARPSTREAM_URL,
  jobs: Topics,
});

// In create task handler
await workerClient.trigger("send-notification", {
  type: "task_created",
  userId: ctx.userId,
  taskId: id,
  taskTitle: input.body.title,
});

// In update task handler (when completed)
if (!wasCompleted && nowCompleted) {
  await workerClient.trigger("generate-report", {
    taskId: task.id,
    userId: ctx.userId,
    completedAt: task.updatedAt.toISOString(),
  });
}
```

## Full Router

```typescript
const taskRouter = router<AppContext>({
  "/": {
    get: factory.procedure
      .output(z.array(TaskSchema))
      .handler(() => Array.from(tasks.values())),

    post: protectedProc
      .input({
        body: z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
        }),
      })
      .output(TaskSchema)
      .handler(async ({ input, ctx }) => {
        const task = createTask(input.body, ctx.userId);
        await workerClient.trigger("send-notification", { ... });
        return task;
      }),
  },

  "{id}": {
    get: factory.procedure
      .input({ params: z.object({ id: z.string().uuid() }) })
      .output(TaskSchema)
      .errors({ 404: NotFoundError })
      .handler(({ input, ctx }) => {
        const task = tasks.get(input.params.id);
        if (!task) throw ctx.error({ error: { code: "NOT_FOUND", message: "Task not found" } });
        return task;
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
      .errors({ 404: NotFoundError, 403: ForbiddenError })
      .handler(async ({ input, ctx }) => {
        // Update task, trigger report if completed
        // ...
      }),

    delete: protectedProc
      .input({ params: z.object({ id: z.string().uuid() }) })
      .output(z.object({ success: z.boolean() }))
      .errors({ 404: NotFoundError, 403: ForbiddenError })
      .handler(({ input, ctx }) => {
        // Delete task
        // ...
      }),
  },
});
```

