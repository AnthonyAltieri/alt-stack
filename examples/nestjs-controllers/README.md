# NestJS Controllers to Alt Stack

This example compares the same small task workflow implemented two ways:

- `src/controller-app.ts`: conventional NestJS controllers with DTOs validated by `class-validator` and `class-transformer`
- `src/alt-stack-app.ts`: Alt Stack routes mounted into NestJS with request validation defined by Zod schemas
- `src/dtos.ts`: DTO and domain models that the controller and shared services use
- `src/schemas.ts`: Alt Stack-only Zod schemas layered on top of the existing DTO-shaped services

Both apps expose the same API shape under `/v1/api/tasks`, use the same in-memory domain services, and differ mainly in route composition, validation style, and request-context wiring.

The shared domain layer now throws the same concrete typed errors that the Alt Stack routes declare. That keeps the Alt Stack example honest: declared errors are the source of truth, not a wrapper around a generic domain error.

The main teaching point is that the services stay DTO-shaped. The Alt Stack version adds `schemas.ts` as a thin parsing layer instead of forcing the shared services to be rewritten around Zod.

## Domain

The example models a small task service with:

- ownership via `ownerId`
- assignment via `assigneeId`
- workflow state via `status`
- prioritization via `priority`
- activity side effects recorded when tasks are created, assigned, and completed

The route complexity is intentionally moderate: several routes coordinate multiple services so the comparison feels like a real application rather than a validation sandbox.

## Route Mapping

| Controller route | Alt Stack route |
| --- | --- |
| `@Get()` | `GET /tasks` |
| `@Post()` | `POST /tasks` |
| `@Get(":id")` | `GET /tasks/{id}` |
| `@Patch(":id")` | `PATCH /tasks/{id}` |
| `@Post(":id/assign")` | `POST /tasks/{id}/assign` |

## Validation Style

| Controller app | Alt Stack app |
| --- | --- |
| DTO classes like `ListTasksQueryDto`, `CreateTaskDto`, `UpdateTaskDto`, `AssignTaskDto` drive the controller and shared services | Zod schemas like `TaskListQuerySchema`, `CreateTaskBodySchema`, `UpdateTaskBodySchema`, `AssignTaskBodySchema` live in `schemas.ts` only |
| One global Nest `ValidationPipe` transforms and validates request data from DTO metadata | `.input(...)` parses and validates inline with the route |
| Validation is spread across decorators, DTO classes, and pipe setup | Validation stays in the Alt Stack boundary while the services remain unchanged |
| Shared typed errors are translated to Nest HTTP exceptions through one exception filter | Shared typed errors are returned directly from procedures with `err(error)` |

The controller example is intentionally run from compiled `dist` output. That keeps the global Nest validation pipe working with standard TypeScript decorator metadata and avoids showing any manual metadata patching in the source example.

## Request Context

Both implementations use an `x-user-id` header to identify the caller.

- controller app reads the header in controller methods and resolves the actor through `UsersService`
- Alt Stack app resolves the actor in middleware and passes it through `ctx`

This keeps the apps self-contained while still demonstrating ownership and authorization rules.

The controller app still uses Nest-native HTTP exceptions at the boundary, but it gets there through a single exception filter. The shared layer itself stays aligned with the Alt Stack declared error model.

## Multi-Service Route Example

`POST /tasks/:id/assign` is intentionally orchestration-heavy in both implementations:

1. load the caller from `UsersService`
2. load the task from `TasksService`
3. load the assignee from `UsersService`
4. authorize with `TaskPolicyService`
5. persist the assignment through `TasksService`
6. record side effects with `TaskActivityService`

That route is the clearest side-by-side example of controller DTO plumbing versus Alt Stack procedure + middleware composition.

It also shows the migration story: `TasksService.assign(...)` still accepts DTO-shaped input, while the Alt Stack route just parses the request with Zod before handing that shape to the unchanged service.

## Behavior Highlights

- `GET /tasks?status=&assigneeId=&limit=` filters the in-memory task list
- `POST /tasks` creates a task owned by the caller
- `POST /tasks/:id/assign` assigns a task to a known user
- `PATCH /tasks/:id` updates content and enforces status-transition rules
- invalid transitions return a conflict response

## Run It

```bash
pnpm --filter nestjs-controllers dev:controllers
pnpm --filter nestjs-controllers dev:altstack
```

The controller app starts on port `3001` by default, and the Alt Stack app starts on port `3002`.

## Compare the Implementations

```bash
pnpm --filter nestjs-controllers test:e2e
```

The e2e suite compares both implementations for:

- list filtering
- create-task validation
- missing-resource behavior
- multi-service assignment flow
- unauthorized assignment
- valid status transitions
- invalid transition conflicts
