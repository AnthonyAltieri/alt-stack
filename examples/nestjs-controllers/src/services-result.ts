import { Injectable } from "@nestjs/common";
import { err, isErr, ok } from "@alt-stack/server-nestjs";
import type { Result } from "@alt-stack/server-nestjs";
import {
  type ActivityEntry,
  type AssignTaskDto,
  type CreateTaskDto,
  type ListTasksQueryDto,
  type Task,
  TaskStatusDto,
  type UpdateTaskDto,
  type User,
  UserRoleDto,
} from "./dtos.js";
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
  seedTasks,
  seedUsers,
} from "./services.js";

type UpdateTaskError = NotFoundError | ForbiddenError | InvalidTransitionError;
type AssignTaskError = NotFoundError | ForbiddenError;

@Injectable()
export class UsersResultService {
  private readonly users = new Map(seedUsers.map((user) => [user.id, { ...user }]));

  findById(id: string): User | null {
    return this.users.get(id) ?? null;
  }

  findUserResult(userId: string | undefined): Result<User, UnauthorizedError> {
    if (!userId) return err(new UnauthorizedError("x-user-id header is required"));

    const user = this.findById(userId);
    if (!user) return err(new UnauthorizedError("Unknown user"));

    return ok(user);
  }

  findAssigneeResult(assigneeId: string): Result<User, NotFoundError> {
    const assignee = this.findById(assigneeId);
    if (!assignee) return err(new NotFoundError(`User ${assigneeId} was not found`));

    return ok(assignee);
  }
}

@Injectable()
export class TasksResultService {
  private readonly tasks = new Map(seedTasks.map((task) => [task.id, { ...task }]));

  list(filters: ListTasksQueryDto): Task[] {
    let tasks = Array.from(this.tasks.values());
    if (filters.status) {
      tasks = tasks.filter((task) => task.status === filters.status);
    }
    if (filters.assigneeId) {
      tasks = tasks.filter((task) => task.assigneeId === filters.assigneeId);
    }
    if (filters.limit) {
      tasks = tasks.slice(0, filters.limit);
    }
    return tasks;
  }

  findById(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  findTaskResult(id: string): Result<Task, NotFoundError> {
    const task = this.findById(id);
    if (!task) return err(new NotFoundError(`Task ${id} was not found`));

    return ok(task);
  }

  create(input: CreateTaskDto, ownerId: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description,
      status: TaskStatusDto.Todo,
      priority: input.priority,
      ownerId,
      assigneeId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  update(task: Task, patch: UpdateTaskDto): Task {
    const updated: Task = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(updated.id, updated);
    return updated;
  }

  assign(task: Task, input: AssignTaskDto): Task {
    const updated: Task = {
      ...task,
      assigneeId: input.assigneeId,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(updated.id, updated);
    return updated;
  }
}

@Injectable()
export class TaskPolicyResultService {
  assertCanAssign(task: Task, actor: User): Result<void, ForbiddenError> {
    if (actor.role === UserRoleDto.Admin || actor.id === task.ownerId) {
      return ok(undefined);
    }

    return err(new ForbiddenError("Only the owner or an admin can assign this task"));
  }

  assertCanUpdate(
    task: Task,
    actor: User,
    nextStatus?: TaskStatusDto,
  ): Result<void, ForbiddenError | InvalidTransitionError> {
    if (
      actor.role !== UserRoleDto.Admin &&
      actor.id !== task.ownerId &&
      actor.id !== task.assigneeId
    ) {
      return err(new ForbiddenError("You do not have access to update this task"));
    }

    if (!nextStatus) {
      return ok(undefined);
    }

    return this.assertValidTransition(task, actor, nextStatus);
  }

  private assertValidTransition(
    task: Task,
    actor: User,
    nextStatus: TaskStatusDto,
  ): Result<void, InvalidTransitionError> {
    if (task.status === nextStatus) {
      return ok(undefined);
    }

    if (
      nextStatus === TaskStatusDto.InProgress &&
      task.assigneeId !== actor.id &&
      actor.role !== UserRoleDto.Admin
    ) {
      return err(new InvalidTransitionError("Only the assigned user can move a task to in_progress"));
    }

    if (nextStatus === TaskStatusDto.Completed) {
      const canComplete = task.assigneeId === actor.id || actor.role === UserRoleDto.Admin;
      const validPreviousState = task.status === TaskStatusDto.InProgress;
      if (!canComplete || !validPreviousState) {
        return err(
          new InvalidTransitionError(
            "Tasks can only be completed by the assignee after they are in progress",
          ),
        );
      }
    }

    return ok(undefined);
  }
}

@Injectable()
export class TaskActivityResultService {
  private readonly activityLog: ActivityEntry[] = [];

  record(entry: ActivityEntry): ActivityEntry {
    this.activityLog.push(entry);
    return entry;
  }

  listForTask(taskId: string): ActivityEntry[] {
    return this.activityLog.filter((entry) => entry.taskId === taskId);
  }
}

@Injectable()
export class TaskWorkflowResultService {
  constructor(
    private readonly usersService: UsersResultService,
    private readonly tasksService: TasksResultService,
    private readonly taskPolicyService: TaskPolicyResultService,
    private readonly taskActivityService: TaskActivityResultService,
  ) {}

  createTaskAsActor(
    actor: User,
    input: CreateTaskDto,
  ): Result<Task, never> {
    const task = this.tasksService.create(input, actor.id);
    this.taskActivityService.record({
      taskId: task.id,
      action: "created",
      actorId: actor.id,
      details: `Task created with ${task.priority} priority`,
    });
    return ok(task);
  }

  getTaskById(taskId: string): Result<Task, NotFoundError> {
    return this.tasksService.findTaskResult(taskId);
  }

  updateTaskAsActor(
    actor: User,
    taskId: string,
    patch: UpdateTaskDto,
  ): Result<Task, UpdateTaskError> {
    const taskResult = this.tasksService.findTaskResult(taskId);
    if (isErr(taskResult)) return taskResult;

    const policyResult = this.taskPolicyService.assertCanUpdate(
      taskResult.value,
      actor,
      patch.status,
    );
    if (isErr(policyResult)) return policyResult;

    const updatedTask = this.tasksService.update(taskResult.value, patch);
    if (taskResult.value.status !== TaskStatusDto.Completed && updatedTask.status === TaskStatusDto.Completed) {
      this.taskActivityService.record({
        taskId: updatedTask.id,
        action: "completed",
        actorId: actor.id,
        details: `${actor.name} completed the task`,
      });
    }
    return ok(updatedTask);
  }

  assignTaskAsActor(
    actor: User,
    taskId: string,
    input: AssignTaskDto,
  ): Result<Task, AssignTaskError> {
    const taskResult = this.tasksService.findTaskResult(taskId);
    if (isErr(taskResult)) return taskResult;

    const assigneeResult = this.usersService.findAssigneeResult(input.assigneeId);
    if (isErr(assigneeResult)) return assigneeResult;

    const policyResult = this.taskPolicyService.assertCanAssign(taskResult.value, actor);
    if (isErr(policyResult)) return policyResult;

    const updatedTask = this.tasksService.assign(taskResult.value, { assigneeId: assigneeResult.value.id });
    this.taskActivityService.record({
      taskId: updatedTask.id,
      action: "assigned",
      actorId: actor.id,
      details: `${actor.name} assigned the task to ${assigneeResult.value.name}`,
    });
    return ok(updatedTask);
  }
}
