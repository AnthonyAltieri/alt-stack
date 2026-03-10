# NestJS Controllers to Alt Stack

This example shows the same NestJS app implemented in two ways:

- `src/controller-app.ts`: standard NestJS controllers with decorator-based routing
- `src/alt-stack-app.ts`: the Alt Stack rewrite, where the controllers are replaced by `registerAltStack(...)` routes

Both versions expose the same API shape under `/v1/api`.

## Route Mapping

| Controller route | Alt Stack route |
| --- | --- |
| `@Get("users/:id")` | `"/users/{id}"` |
| `@Get("query")` | `"/query"` |
| `@Post("items")` | `"/items"` |
| `@Get("error")` | `"/error"` |

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

The e2e test boots both apps and verifies they agree on:

- path parameter handling
- query validation
- body validation
- not-found behavior
