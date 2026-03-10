import { Injectable } from "@nestjs/common";
import { TaggedError } from "@alt-stack/server-nestjs";
import { z } from "zod";

export const TaskStatusSchema = z.enum(["todo", "in_progress", "completed"]);
export const TaskPrioritySchema = z.enum(["low", "medium", "high"]);

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["member", "admin"]),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  ownerId: z.string(),
  assigneeId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TaskListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  assigneeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  priority: TaskPrioritySchema,
});

export const UpdateTaskBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
});

export const AssignTaskBodySchema = z.object({
  assigneeId: z.string(),
});

export const ActivityEntrySchema = z.object({
  taskId: z.string(),
  action: z.enum(["created", "assigned", "completed"]),
  actorId: z.string(),
  details: z.string(),
});

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

export const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

export const NotFoundErrorSchema = z.object({
  _tag: z.literal("NotFoundError"),
  message: z.string(),
});

export const ForbiddenErrorSchema = z.object({
  _tag: z.literal("ForbiddenError"),
  message: z.string(),
});

export const InvalidTransitionErrorSchema = z.object({
  _tag: z.literal("InvalidTransitionError"),
  message: z.string(),
});

export type User = z.infer<typeof UserSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

const seedUsers: User[] = [
  { id: "u-admin", name: "Avery Admin", role: "admin" },
  { id: "u-alice", name: "Alice Owner", role: "member" },
  { id: "u-bob", name: "Bob Builder", role: "member" },
  { id: "u-chris", name: "Chris Reviewer", role: "member" },
];

const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Prepare release notes",
    description: "Summarize launch changes for the next deploy.",
    status: "todo",
    priority: "high",
    ownerId: "u-alice",
    assigneeId: "u-bob",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "task-2",
    title: "Audit rate limits",
    description: "Review API gateway thresholds.",
    status: "in_progress",
    priority: "medium",
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

  list(filters: z.infer<typeof TaskListQuerySchema>): Task[] {
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

  create(input: z.infer<typeof CreateTaskBodySchema>, ownerId: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description,
      status: "todo",
      priority: input.priority,
      ownerId,
      assigneeId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  update(
    task: Task,
    patch: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "assigneeId">>,
  ): Task {
    const updated: Task = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(updated.id, updated);
    return updated;
  }
}

@Injectable()
export class TaskPolicyService {
  assertCanAssign(task: Task, actor: User): void {
    if (actor.role === "admin" || actor.id === task.ownerId) {
      return;
    }
    throw new ForbiddenError("Only the owner or an admin can assign this task");
  }

  assertCanUpdate(task: Task, actor: User, nextStatus?: TaskStatus): void {
    if (actor.role === "admin" || actor.id === task.ownerId || actor.id === task.assigneeId) {
      if (nextStatus) {
        this.assertValidTransition(task, actor, nextStatus);
      }
      return;
    }
    throw new ForbiddenError("You do not have access to update this task");
  }

  private assertValidTransition(task: Task, actor: User, nextStatus: TaskStatus): void {
    if (task.status === nextStatus) {
      return;
    }
    if (nextStatus === "in_progress" && task.assigneeId !== actor.id && actor.role !== "admin") {
      throw new InvalidTransitionError(
        "Only the assigned user can move a task to in_progress",
      );
    }
    if (nextStatus === "completed") {
      const canComplete = task.assigneeId === actor.id || actor.role === "admin";
      const validPreviousState = task.status === "in_progress";
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

export function requireUser(
  usersService: UsersService,
  userId: string | undefined,
): User {
  if (!userId) {
    throw new UnauthorizedError("x-user-id header is required");
  }

  const user = usersService.findById(userId);
  if (!user) {
    throw new UnauthorizedError("Unknown user");
  }
  return user;
}

export function requireTask(
  tasksService: TasksService,
  taskId: string,
): Task {
  const task = tasksService.findById(taskId);
  if (!task) {
    throw new NotFoundError(`Task ${taskId} was not found`);
  }
  return task;
}

export function requireAssignee(
  usersService: UsersService,
  assigneeId: string,
): User {
  const assignee = usersService.findById(assigneeId);
  if (!assignee) {
    throw new NotFoundError(`User ${assigneeId} was not found`);
  }
  return assignee;
}
