import "reflect-metadata";

import { pathToFileURL } from "node:url";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NestAppLike,
  type NestBaseContext,
  err,
  init,
  isErr,
  ok,
  registerAltStack,
  router,
} from "@alt-stack/server-nestjs";
import { z } from "zod";
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
  UnexpectedTaskErrorSchema,
  UpdateTaskBodySchema,
} from "./schemas.js";
import {
  TaskActivityResultService,
  TaskPolicyResultService,
  TaskWorkflowResultService,
  TasksResultService,
  UsersResultService,
} from "./services-result.js";

type Actor = User;
type AppContext = NestBaseContext & { actor?: Actor };

const createFallback500Error = (
  error: unknown,
): [typeof UnexpectedTaskErrorSchema, z.infer<typeof UnexpectedTaskErrorSchema>] => [
  UnexpectedTaskErrorSchema,
  {
    _tag: "UnexpectedTaskError",
    message: "Unexpected task service failure",
    details: [error instanceof Error ? error.message : String(error)],
  },
];

const factory = init<{ actor?: Actor }>({
  default500Error: createFallback500Error,
});

const protectedProcedure = factory.procedure
  .errors({
    401: UnauthorizedErrorSchema,
  })
  .use(async ({ ctx, next }) => {
    const users = ctx.nest.get<UsersResultService>(UsersResultService);
    const actorResult = users.findUserResult(
      typeof ctx.express.req.headers["x-user-id"] === "string"
        ? ctx.express.req.headers["x-user-id"]
        : undefined,
    );

    if (isErr(actorResult)) return err(actorResult.error);

    return next({ ctx: { actor: actorResult.value } });
  });

const apiRouter = router<AppContext>({
  "/tasks": {
    get: factory.procedure
      .input({ query: TaskListQuerySchema })
      .output(z.array(TaskSchema))
      .get(({ ctx, input }) => {
        const tasks = ctx.nest.get<TasksResultService>(TasksResultService);
        return ok(tasks.list(input.query));
      }),

    post: protectedProcedure
      .input({ body: CreateTaskBodySchema })
      .output(TaskSchema)
      .errors({
        401: UnauthorizedErrorSchema,
      })
      .post(({ ctx, input }) => {
        const workflow = ctx.nest.get<TaskWorkflowResultService>(TaskWorkflowResultService);
        return workflow.createTaskAsActor(ctx.actor, input.body);
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
        const workflow = ctx.nest.get<TaskWorkflowResultService>(TaskWorkflowResultService);
        return workflow.getTaskById(input.params.id);
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
        const workflow = ctx.nest.get<TaskWorkflowResultService>(TaskWorkflowResultService);
        return workflow.updateTaskAsActor(ctx.actor, input.params.id, input.body);
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
      const workflow = ctx.nest.get<TaskWorkflowResultService>(TaskWorkflowResultService);
      return workflow.assignTaskAsActor(ctx.actor, input.params.id, input.body);
    }),
});

@Module({
  providers: [
    UsersResultService,
    TasksResultService,
    TaskPolicyResultService,
    TaskActivityResultService,
    TaskWorkflowResultService,
  ],
})
class AltStackResultExampleModule {}

export async function createAltStackResultApp() {
  const app = await NestFactory.create(AltStackResultExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
  const nestLikeApp = app as unknown as NestAppLike;
  registerAltStack(nestLikeApp, { "/": apiRouter }, {
    mountPath: "/api",
    defaultErrorHandlers: factory.defaultErrorHandlers,
  });
  await app.init();
  return app;
}

export async function startAltStackResultApp(port = Number(process.env.PORT ?? 3003)) {
  const app = await createAltStackResultApp();
  await app.listen(port);
  console.log(
    `Alt Stack Result example listening on http://localhost:${port}/v1/api/tasks`,
  );
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startAltStackResultApp();
}
