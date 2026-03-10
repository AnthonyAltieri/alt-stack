import "reflect-metadata";

import { pathToFileURL } from "node:url";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NestBaseContext,
  type NestAppLike,
  TaggedError,
  err,
  init,
  ok,
  registerAltStack,
  router,
} from "@alt-stack/server-nestjs";
import { z } from "zod";
import {
  AssignTaskBodySchema,
  CreateTaskBodySchema,
  TaskActivityService,
  TaskListQuerySchema,
  TaskPolicyService,
  TaskSchema,
  TasksService,
  UpdateTaskBodySchema,
  UsersService,
  requireAssignee,
  requireTask,
  requireUser,
} from "./shared.js";

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
}

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
}

class ForbiddenError extends TaggedError {
  readonly _tag = "ForbiddenError" as const;
}

class InvalidTransitionError extends TaggedError {
  readonly _tag = "InvalidTransitionError" as const;
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const NotFoundErrorSchema = z.object({
  _tag: z.literal("NotFoundError"),
  message: z.string(),
});

const ForbiddenErrorSchema = z.object({
  _tag: z.literal("ForbiddenError"),
  message: z.string(),
});

const InvalidTransitionErrorSchema = z.object({
  _tag: z.literal("InvalidTransitionError"),
  message: z.string(),
});

const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["member", "admin"]),
});

type Actor = z.infer<typeof ActorSchema>;
type AppContext = NestBaseContext & { actor?: Actor };

function mapDomainError(error: unknown): Error {
  if (
    error &&
    typeof error === "object" &&
    "tag" in error &&
    "message" in error
  ) {
    const domainError = error as { tag: string; message: string };
    if (domainError.tag === "UnauthorizedError") {
      return new UnauthorizedError(domainError.message);
    }
    if (domainError.tag === "NotFoundError") {
      return new NotFoundError(domainError.message);
    }
    if (domainError.tag === "ForbiddenError") {
      return new ForbiddenError(domainError.message);
    }
    if (domainError.tag === "InvalidTransitionError") {
      return new InvalidTransitionError(domainError.message);
    }
  }
  return error as Error;
}

const factory = init<{ actor?: Actor }>();

const protectedProcedure = factory.procedure
  .errors({
    401: UnauthorizedErrorSchema,
  })
  .use(async ({ ctx, next }) => {
    try {
      const users = ctx.nest.get<UsersService>(UsersService);
      const actor = requireUser(
        users,
        typeof ctx.express.req.headers["x-user-id"] === "string"
          ? ctx.express.req.headers["x-user-id"]
          : undefined,
      );
      return next({ ctx: { actor } });
    } catch (error) {
      return err(mapDomainError(error) as UnauthorizedError);
    }
  });

const apiRouter = router<AppContext>({
  "/tasks": {
    get: factory.procedure
      .input({ query: TaskListQuerySchema })
      .output(z.array(TaskSchema))
      .get(({ ctx, input }) => {
        const tasks = ctx.nest.get<TasksService>(TasksService);
        return ok(tasks.list(input.query));
      }),

    post: protectedProcedure
      .input({ body: CreateTaskBodySchema })
      .output(TaskSchema)
      .errors({
        401: UnauthorizedErrorSchema,
      })
      .post(({ ctx, input }) => {
        const tasks = ctx.nest.get<TasksService>(TasksService);
        const users = ctx.nest.get<UsersService>(UsersService);
        const activity = ctx.nest.get<TaskActivityService>(TaskActivityService);

        const actor = requireUser(users, ctx.actor?.id);
        const task = tasks.create(input.body, actor.id);
        activity.record({
          taskId: task.id,
          action: "created",
          actorId: actor.id,
          details: `Task created with ${task.priority} priority`,
        });
        return ok(task);
      }),
  },

  "/tasks/{id}": {
    get: factory.procedure
      .input({ params: z.object({ id: z.string() }) })
      .output(TaskSchema)
      .errors({
        404: NotFoundErrorSchema,
      })
      .get(({ ctx, input }) => {
        try {
          return ok(requireTask(ctx.nest.get<TasksService>(TasksService), input.params.id));
        } catch (error) {
          return err(mapDomainError(error) as NotFoundError);
        }
      }),

    patch: protectedProcedure
      .input({
        params: z.object({ id: z.string() }),
        body: UpdateTaskBodySchema,
      })
      .output(TaskSchema)
      .errors({
        403: ForbiddenErrorSchema,
        404: NotFoundErrorSchema,
        409: InvalidTransitionErrorSchema,
      })
      .patch(({ ctx, input }) => {
        try {
          const tasks = ctx.nest.get<TasksService>(TasksService);
          const users = ctx.nest.get<UsersService>(UsersService);
          const policy = ctx.nest.get<TaskPolicyService>(TaskPolicyService);
          const activity = ctx.nest.get<TaskActivityService>(TaskActivityService);

          const actor = requireUser(users, ctx.actor?.id);
          const existingTask = requireTask(tasks, input.params.id);
          policy.assertCanUpdate(existingTask, actor, input.body.status);
          const updatedTask = tasks.update(existingTask, input.body);
          if (existingTask.status !== "completed" && updatedTask.status === "completed") {
            activity.record({
              taskId: updatedTask.id,
              action: "completed",
              actorId: actor.id,
              details: `${actor.name} completed the task`,
            });
          }
          return ok(updatedTask);
        } catch (error) {
          return err(
            mapDomainError(error) as
              | ForbiddenError
              | NotFoundError
              | InvalidTransitionError,
          );
        }
      }),
  },

  "/tasks/{id}/assign": protectedProcedure
    .input({
      params: z.object({ id: z.string() }),
      body: AssignTaskBodySchema,
    })
    .output(TaskSchema)
    .errors({
      403: ForbiddenErrorSchema,
      404: NotFoundErrorSchema,
    })
    .post(({ ctx, input }) => {
      try {
        const tasks = ctx.nest.get<TasksService>(TasksService);
        const users = ctx.nest.get<UsersService>(UsersService);
        const policy = ctx.nest.get<TaskPolicyService>(TaskPolicyService);
        const activity = ctx.nest.get<TaskActivityService>(TaskActivityService);

        const actor = requireUser(users, ctx.actor?.id);
        const task = requireTask(tasks, input.params.id);
        const assignee = requireAssignee(users, input.body.assigneeId);
        policy.assertCanAssign(task, actor);
        const updatedTask = tasks.update(task, { assigneeId: assignee.id });
        activity.record({
          taskId: updatedTask.id,
          action: "assigned",
          actorId: actor.id,
          details: `${actor.name} assigned the task to ${assignee.name}`,
        });
        return ok(updatedTask);
      } catch (error) {
        return err(mapDomainError(error) as ForbiddenError | NotFoundError);
      }
    }),
});

@Module({
  providers: [UsersService, TasksService, TaskPolicyService, TaskActivityService],
})
class AltStackExampleModule {}

export async function createAltStackApp() {
  const app = await NestFactory.create(AltStackExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
  const nestLikeApp = app as unknown as NestAppLike;
  registerAltStack(nestLikeApp, { "/": apiRouter }, { mountPath: "/api" });
  await app.init();
  return app;
}

export async function startAltStackApp(port = Number(process.env.PORT ?? 3002)) {
  const app = await createAltStackApp();
  await app.listen(port);
  console.log(`Alt Stack NestJS example listening on http://localhost:${port}/v1/api/tasks`);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startAltStackApp();
}
