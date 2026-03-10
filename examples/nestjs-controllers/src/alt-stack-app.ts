import "reflect-metadata";

import { pathToFileURL } from "node:url";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NestAppLike,
  type NestBaseContext,
  err,
  init,
  isResultError as isError,
  ok,
  registerAltStack,
  router,
} from "@alt-stack/server-nestjs";
import { z } from "zod";
import {
  TaskActivityService,
  TaskPolicyService,
  TasksService,
  UsersService,
  requireAssignee,
  requireTask,
  requireUser,
} from "./shared.js";
import type {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
} from "./shared.js";
import type { User } from "./dtos.js";
import {
  AssignTaskBodySchema,
  CreateTaskBodySchema,
  ForbiddenErrorSchema,
  InvalidTransitionErrorSchema,
  NotFoundErrorSchema,
  TaskListQuerySchema,
  TaskSchema,
  UnauthorizedErrorSchema,
  UpdateTaskBodySchema,
} from "./schemas.js";

type Actor = User;
type AppContext = NestBaseContext & { actor?: Actor };
type AppError =
  | UnauthorizedError
  | NotFoundError
  | ForbiddenError
  | InvalidTransitionError;

const factory = init<{ actor?: Actor }>();

function hasErrorTag<Tag extends AppError["_tag"]>(
  error: unknown,
  tag: Tag,
): error is Extract<AppError, { readonly _tag: Tag }> {
  return isError(error) && error._tag === tag;
}

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
      if (hasErrorTag(error, "UnauthorizedError")) {
        return err(error);
      }
      throw error;
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
          if (hasErrorTag(error, "NotFoundError")) {
            return err(error);
          }
          throw error;
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
          if (
            hasErrorTag(error, "ForbiddenError") ||
            hasErrorTag(error, "NotFoundError") ||
            hasErrorTag(error, "InvalidTransitionError")
          ) {
            return err(error);
          }
          throw error;
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
        const updatedTask = tasks.assign(task, { assigneeId: assignee.id });
        activity.record({
          taskId: updatedTask.id,
          action: "assigned",
          actorId: actor.id,
          details: `${actor.name} assigned the task to ${assignee.name}`,
        });
        return ok(updatedTask);
      } catch (error) {
        if (hasErrorTag(error, "ForbiddenError") || hasErrorTag(error, "NotFoundError")) {
          return err(error);
        }
        throw error;
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
