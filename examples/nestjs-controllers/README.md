# NestJS Controllers to Alt Stack

This example compares the same small task workflow implemented three ways:

- `src/controller-app.ts`: conventional NestJS controllers with DTOs validated by `class-validator` and `class-transformer`
- `src/alt-stack-app.ts`: Alt Stack routes mounted into NestJS with request validation defined by Zod schemas and the existing throw-based services
- `src/alt-stack-result-app.ts`: Alt Stack routes mounted into NestJS with the same Zod boundary and a `Result`-based service layer
- `src/dtos.ts`: DTO and domain models that the controller and shared services use
- `src/schemas.ts`: Alt Stack-only Zod schemas layered on top of the existing DTO-shaped services
- `src/shared.ts`: throw-based services that the controller and first Alt Stack variant share
- `src/shared-result.ts`: `Result`-based services and workflow helpers used by the third variant

All three apps expose the same API shape under `/v1/api/tasks`, use the same in-memory task domain, and differ mainly in validation style, error flow, and route composition.

The shared domain layer now throws the same concrete typed errors that the Alt Stack routes declare. That keeps the Alt Stack example honest: declared errors are the source of truth, not a wrapper around a generic domain error.

The migration story is deliberate:

1. keep the existing NestJS controllers and DTO-shaped services
2. drop in Alt Stack with `schemas.ts` as a thin Zod parsing layer
3. convert the services to `Result` and show how the Alt Stack routes get even smaller

The main teaching point is that the DTO/domain contract stays intact across all three steps. The Alt Stack versions do not force the shared services to be rewritten around Zod.

## Domain

The example models a small task service with:

- ownership via `ownerId`
- assignment via `assigneeId`
- workflow state via `status`
- prioritization via `priority`
- activity side effects recorded when tasks are created, assigned, and completed

The route complexity is intentionally moderate: several routes coordinate multiple services so the comparison feels like a real application rather than a validation sandbox.

## Route Mapping

| Controller route | Alt Stack route | Alt Stack `Result` route |
| --- | --- | --- |
| `@Get()` | `GET /tasks` | `GET /tasks` |
| `@Post()` | `POST /tasks` | `POST /tasks` |
| `@Get(":id")` | `GET /tasks/{id}` | `GET /tasks/{id}` |
| `@Patch(":id")` | `PATCH /tasks/{id}` | `PATCH /tasks/{id}` |
| `@Post(":id/assign")` | `POST /tasks/{id}/assign` | `POST /tasks/{id}/assign` |

## Validation Style

| Controller app | Alt Stack app | Alt Stack `Result` app |
| --- | --- | --- |
| DTO classes like `ListTasksQueryDto`, `CreateTaskDto`, `UpdateTaskDto`, `AssignTaskDto` drive the controller and shared services | Zod schemas like `TaskListQuerySchema`, `CreateTaskBodySchema`, `UpdateTaskBodySchema`, `AssignTaskBodySchema` live in `schemas.ts` only |
| One global Nest `ValidationPipe` transforms and validates request data from DTO metadata | `.input(...)` parses and validates inline with the route | `.input(...)` parses and validates inline with the route |
| Validation is spread across decorators, DTO classes, and pipe setup | Validation stays in the Alt Stack boundary while the services remain unchanged | Validation stays in the Alt Stack boundary while the services return `Result` |
| Shared typed errors are translated to Nest HTTP exceptions through one exception filter | Shared typed errors are returned directly from procedures with `err(error)` | `Result` helpers return typed errors directly, so the route just forwards `Err` and unwraps `Ok` |

## Service Style

| Variant | Service layer | Route ergonomics | Error handling model |
| --- | --- | --- | --- |
| NestJS controller | DTO-shaped services in `shared.ts` throw typed errors | Controller methods orchestrate service calls directly | Global Nest exception filter maps tagged errors to HTTP exceptions |
| Alt Stack + throw services | Same DTO-shaped services in `shared.ts` throw typed errors | Procedures use Zod input and small `try/catch` blocks to return declared errors | Tagged errors come from the shared domain and global `default500Error` handles unexpected plain errors |
| Alt Stack + `Result` services | DTO-shaped services in `shared-result.ts` return `Result` | Procedures call one workflow helper and branch on `isErr(result)` | Tagged errors flow through the `Result` type and the same global `default500Error` handles unexpected plain errors |

The controller example is intentionally run from compiled `dist` output. That keeps the global Nest validation pipe working with standard TypeScript decorator metadata and avoids showing any manual metadata patching in the source example.

Both Alt Stack examples show the global fallback path for untagged errors: `init({ default500Error })` defines a single 500 serializer that converts unexpected non-tagged failures into an `UnexpectedTaskError` response shape for the whole router.

## Request Context

Both implementations use an `x-user-id` header to identify the caller.

- controller app reads the header in controller methods and resolves the actor through `UsersService`
- Alt Stack app resolves the actor in middleware and passes it through `ctx`

This keeps the apps self-contained while still demonstrating ownership and authorization rules.

The controller app still uses Nest-native HTTP exceptions at the boundary, but it gets there through a single exception filter. The shared layer itself stays aligned with the Alt Stack declared error model.

## Multi-Service Route Example

`POST /tasks/:id/assign` is intentionally orchestration-heavy in all three implementations:

1. load the caller from `UsersService`
2. load the task from `TasksService`
3. load the assignee from `UsersService`
4. authorize with `TaskPolicyService`
5. persist the assignment through `TasksService`
6. record side effects with `TaskActivityService`

That route is the clearest side-by-side example of controller DTO plumbing versus Alt Stack procedure + middleware composition versus the `Result`-based workflow helper.

It also shows the migration story: `TasksService.assign(...)` still accepts DTO-shaped input, the throw-based Alt Stack route parses with Zod before handing that shape to the unchanged service, and the `Result` variant keeps the same DTO input while shrinking the route to a single service call plus `isErr(...)`.

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
pnpm --filter nestjs-controllers dev:altstack:result
```

The controller app starts on port `3001` by default, the throw-based Alt Stack app starts on port `3002`, and the `Result`-based Alt Stack app starts on port `3003`.

## Compare the Implementations

```bash
pnpm --filter nestjs-controllers test:e2e
```

The e2e suite compares all three implementations for:

- list filtering
- create-task validation
- missing-resource behavior
- multi-service assignment flow
- unauthorized assignment
- valid status transitions
- invalid transition conflicts
- matching tagged error payloads in the two Alt Stack variants
