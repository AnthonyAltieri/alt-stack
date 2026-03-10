import "reflect-metadata";

import { pathToFileURL } from "node:url";
import {
  ArgumentsHost,
  Body,
  Catch,
  ConflictException,
  Controller,
  ExceptionFilter,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost, NestFactory } from "@nestjs/core";
import {
  AssignTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from "./dtos.js";
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  TaskActivityService,
  TaskPolicyService,
  TasksService,
  UnauthorizedError,
  UsersService,
  requireAssignee,
  requireTask,
  requireUser,
} from "./shared.js";

@Catch(UnauthorizedError, NotFoundError, ForbiddenError, InvalidTransitionError)
class TaskDomainExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  override catch(
    exception:
      | UnauthorizedError
      | NotFoundError
      | ForbiddenError
      | InvalidTransitionError,
    host: ArgumentsHost,
  ) {
    if (exception instanceof UnauthorizedError) {
      return super.catch(new UnauthorizedException(exception.message), host);
    }
    if (exception instanceof NotFoundError) {
      return super.catch(new NotFoundException(exception.message), host);
    }
    if (exception instanceof ForbiddenError) {
      return super.catch(new ForbiddenException(exception.message), host);
    }
    return super.catch(new ConflictException(exception.message), host);
  }
}

@Controller("api/tasks")
class TasksController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(TaskPolicyService) private readonly taskPolicyService: TaskPolicyService,
    @Inject(TaskActivityService) private readonly taskActivityService: TaskActivityService,
  ) {}

  @Get()
  listTasks(@Query() query: ListTasksQueryDto) {
    return this.tasksService.list(query);
  }

  @Post()
  createTask(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: CreateTaskDto,
  ) {
    const actor = requireUser(this.usersService, userId);
    const task = this.tasksService.create(body, actor.id);
    this.taskActivityService.record({
      taskId: task.id,
      action: "created",
      actorId: actor.id,
      details: `Task created with ${task.priority} priority`,
    });
    return task;
  }

  @Get(":id")
  getTask(@Param("id") id: string) {
    return requireTask(this.tasksService, id);
  }

  @Patch(":id")
  updateTask(
    @Param("id") id: string,
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: UpdateTaskDto,
  ) {
    const actor = requireUser(this.usersService, userId);
    const existingTask = requireTask(this.tasksService, id);
    this.taskPolicyService.assertCanUpdate(existingTask, actor, body.status);
    const updatedTask = this.tasksService.update(existingTask, body);
    if (existingTask.status !== "completed" && updatedTask.status === "completed") {
      this.taskActivityService.record({
        taskId: updatedTask.id,
        action: "completed",
        actorId: actor.id,
        details: `${actor.name} completed the task`,
      });
    }
    return updatedTask;
  }

  @Post(":id/assign")
  assignTask(
    @Param("id") id: string,
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: AssignTaskDto,
  ) {
    const actor = requireUser(this.usersService, userId);
    const task = requireTask(this.tasksService, id);
    const assignee = requireAssignee(this.usersService, body.assigneeId);
    this.taskPolicyService.assertCanAssign(task, actor);
    const updatedTask = this.tasksService.update(task, { assigneeId: assignee.id });
    this.taskActivityService.record({
      taskId: updatedTask.id,
      action: "assigned",
      actorId: actor.id,
      details: `${actor.name} assigned the task to ${assignee.name}`,
    });
    return updatedTask;
  }
}

// The tsx/vitest runtime used by this example does not preserve DTO param
// metadata consistently, so we restore the intended Nest metatypes here for
// the global ValidationPipe.
Reflect.defineMetadata("design:paramtypes", [ListTasksQueryDto], TasksController.prototype, "listTasks");
Reflect.defineMetadata(
  "design:paramtypes",
  [String, CreateTaskDto],
  TasksController.prototype,
  "createTask",
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, String, UpdateTaskDto],
  TasksController.prototype,
  "updateTask",
);
Reflect.defineMetadata(
  "design:paramtypes",
  [String, String, AssignTaskDto],
  TasksController.prototype,
  "assignTask",
);

@Module({
  controllers: [TasksController],
  providers: [UsersService, TasksService, TaskPolicyService, TaskActivityService],
})
class ControllerExampleModule {}

export async function createControllerApp() {
  const app = await NestFactory.create(ControllerExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new TaskDomainExceptionFilter(httpAdapterHost.httpAdapter));
  await app.init();
  return app;
}

export async function startControllerApp(port = Number(process.env.PORT ?? 3001)) {
  const app = await createControllerApp();
  await app.listen(port);
  console.log(`NestJS controller example listening on http://localhost:${port}/v1/api/tasks`);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startControllerApp();
}
