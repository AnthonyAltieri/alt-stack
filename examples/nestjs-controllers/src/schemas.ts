import { z } from "zod";
import {
  TaskPriorityDto,
  TaskStatusDto,
  UserRoleDto,
} from "./dtos.js";

export const TaskStatusSchema = z.nativeEnum(TaskStatusDto);
export const TaskPrioritySchema = z.nativeEnum(TaskPriorityDto);
export const UserRoleSchema = z.nativeEnum(UserRoleDto);

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: UserRoleSchema,
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
  assigneeId: z.string().min(1),
});

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

export const UnexpectedTaskErrorSchema = z.object({
  _tag: z.literal("UnexpectedTaskError"),
  message: z.string(),
  details: z.array(z.string()),
});
