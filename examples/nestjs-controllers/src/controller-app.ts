import "reflect-metadata";

import { pathToFileURL } from "node:url";
import {
  Body,
  ConflictException,
  Controller,
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
import { NestFactory } from "@nestjs/core";
import {
  AssignTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from "./dtos.js";
import {
  TaskActivityService,
  TaskPolicyService,
  TasksService,
  UsersService,
  requireAssignee,
  requireTask,
  requireUser,
} from "./shared.js";

function mapDomainError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "tag" in error &&
    "message" in error
  ) {
    const domainError = error as { tag: string; message: string };
    if (domainError.tag === "UnauthorizedError") {
      throw new UnauthorizedException(domainError.message);
    }
    if (domainError.tag === "NotFoundError") {
      throw new NotFoundException(domainError.message);
    }
    if (domainError.tag === "ForbiddenError") {
      throw new ForbiddenException(domainError.message);
    }
    if (domainError.tag === "InvalidTransitionError") {
      throw new ConflictException(domainError.message);
    }
  }
  throw error;
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
  listTasks(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: ListTasksQueryDto,
      }),
    )
    query: ListTasksQueryDto,
  ) {
    return this.tasksService.list(query);
  }

  @Post()
  createTask(
    @Headers("x-user-id") userId: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: CreateTaskDto,
      }),
    )
    body: CreateTaskDto,
  ) {
    try {
      const actor = requireUser(this.usersService, userId);
      const task = this.tasksService.create(body, actor.id);
      this.taskActivityService.record({
        taskId: task.id,
        action: "created",
        actorId: actor.id,
        details: `Task created with ${task.priority} priority`,
      });
      return task;
    } catch (error) {
      mapDomainError(error);
    }
  }

  @Get(":id")
  getTask(@Param("id") id: string) {
    try {
      return requireTask(this.tasksService, id);
    } catch (error) {
      mapDomainError(error);
    }
  }

  @Patch(":id")
  updateTask(
    @Param("id") id: string,
    @Headers("x-user-id") userId: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: UpdateTaskDto,
      }),
    )
    body: UpdateTaskDto,
  ) {
    try {
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
    } catch (error) {
      mapDomainError(error);
    }
  }

  @Post(":id/assign")
  assignTask(
    @Param("id") id: string,
    @Headers("x-user-id") userId: string | undefined,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: AssignTaskDto,
      }),
    )
    body: AssignTaskDto,
  ) {
    try {
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
    } catch (error) {
      mapDomainError(error);
    }
  }
}

@Module({
  controllers: [TasksController],
  providers: [UsersService, TasksService, TaskPolicyService, TaskActivityService],
})
class ControllerExampleModule {}

export async function createControllerApp() {
  const app = await NestFactory.create(ControllerExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
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
