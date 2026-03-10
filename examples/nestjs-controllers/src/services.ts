import { Injectable } from "@nestjs/common";
import { TaggedError } from "@alt-stack/server-nestjs";
import {
  type ActivityEntry,
  AssignTaskDto,
  type CreateTaskDto,
  type ListTasksQueryDto,
  type Task,
  TaskPriorityDto,
  TaskStatusDto,
  type UpdateTaskDto,
  type User,
  UserRoleDto,
} from "./dtos.js";

export class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
}

export class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
}

export class ForbiddenError extends TaggedError {
  readonly _tag = "ForbiddenError" as const;
}

export class InvalidTransitionError extends TaggedError {
  readonly _tag = "InvalidTransitionError" as const;
}

export type TaskDomainError =
  | UnauthorizedError
  | NotFoundError
  | ForbiddenError
  | InvalidTransitionError;

export const seedUsers: User[] = [
  { id: "u-admin", name: "Avery Admin", role: UserRoleDto.Admin },
  { id: "u-alice", name: "Alice Owner", role: UserRoleDto.Member },
  { id: "u-bob", name: "Bob Builder", role: UserRoleDto.Member },
  { id: "u-chris", name: "Chris Reviewer", role: UserRoleDto.Member },
];

export const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Prepare release notes",
    description: "Summarize launch changes for the next deploy.",
    status: TaskStatusDto.Todo,
    priority: TaskPriorityDto.High,
    ownerId: "u-alice",
    assigneeId: "u-bob",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "task-2",
    title: "Audit rate limits",
    description: "Review API gateway thresholds.",
    status: TaskStatusDto.InProgress,
    priority: TaskPriorityDto.Medium,
    ownerId: "u-admin",
    assigneeId: "u-chris",
    createdAt: "2026-03-02T09:00:00.000Z",
    updatedAt: "2026-03-03T08:30:00.000Z",
  },
];

@Injectable()
export class UsersService {
  private readonly users = new Map(seedUsers.map((user) => [user.id, user]));

  findById(id: string): User | null {
    return this.users.get(id) ?? null;
  }
}

@Injectable()
export class TasksService {
  private readonly tasks = new Map(seedTasks.map((task) => [task.id, task]));

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
export class TaskPolicyService {
  assertCanAssign(task: Task, actor: User): void {
    if (actor.role === UserRoleDto.Admin || actor.id === task.ownerId) {
      return;
    }
    throw new ForbiddenError("Only the owner or an admin can assign this task");
  }

  assertCanUpdate(task: Task, actor: User, nextStatus?: TaskStatusDto): void {
    if (
      actor.role === UserRoleDto.Admin ||
      actor.id === task.ownerId ||
      actor.id === task.assigneeId
    ) {
      if (nextStatus) {
        this.assertValidTransition(task, actor, nextStatus);
      }
      return;
    }
    throw new ForbiddenError("You do not have access to update this task");
  }

  private assertValidTransition(task: Task, actor: User, nextStatus: TaskStatusDto): void {
    if (task.status === nextStatus) {
      return;
    }
    if (
      nextStatus === TaskStatusDto.InProgress &&
      task.assigneeId !== actor.id &&
      actor.role !== UserRoleDto.Admin
    ) {
      throw new InvalidTransitionError("Only the assigned user can move a task to in_progress");
    }
    if (nextStatus === TaskStatusDto.Completed) {
      const canComplete = task.assigneeId === actor.id || actor.role === UserRoleDto.Admin;
      const validPreviousState = task.status === TaskStatusDto.InProgress;
      if (!canComplete || !validPreviousState) {
        throw new InvalidTransitionError(
          "Tasks can only be completed by the assignee after they are in progress",
        );
      }
    }
  }
}

@Injectable()
export class TaskActivityService {
  private readonly activityLog: ActivityEntry[] = [];

  record(entry: ActivityEntry): ActivityEntry {
    this.activityLog.push(entry);
    return entry;
  }

  listForTask(taskId: string): ActivityEntry[] {
    return this.activityLog.filter((entry) => entry.taskId === taskId);
  }
}

export function requireUser(usersService: UsersService, userId: string | undefined): User {
  if (!userId) {
    throw new UnauthorizedError("x-user-id header is required");
  }

  const user = usersService.findById(userId);
  if (!user) {
    throw new UnauthorizedError("Unknown user");
  }
  return user;
}

export function requireTask(tasksService: TasksService, taskId: string): Task {
  const task = tasksService.findById(taskId);
  if (!task) {
    throw new NotFoundError(`Task ${taskId} was not found`);
  }
  return task;
}

export function requireAssignee(usersService: UsersService, assigneeId: string): User {
  const assignee = usersService.findById(assigneeId);
  if (!assignee) {
    throw new NotFoundError(`User ${assigneeId} was not found`);
  }
  return assignee;
}
