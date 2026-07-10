# `@alt-stack/server-nestjs`

NestJS integration for Altstack routers on `@nestjs/platform-express`. It adds Nest provider lookup, request-scoped resolution, global-prefix-aware mounting, optional OpenAPI docs, and an Altstack-to-Nest middleware bridge.

## Quickstart

```bash
pnpm add @alt-stack/server-nestjs @nestjs/common @nestjs/core @nestjs/platform-express express zod reflect-metadata
```

```typescript
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  init,
  ok,
  registerAltStack,
  type NestAppLike,
} from "@alt-stack/server-nestjs";

@Module({})
class AppModule {}

const t = init();
const api = t.router({
  "/health": t.procedure.get(() => ok({ ready: true })),
});

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("v1");

registerAltStack(app as unknown as NestAppLike, { "/": api }, {
  mountPath: "/api",
});

await app.listen(3000);
// GET /v1/api/health
```

See the full [server quickstart](../../apps/docs/docs/server/quickstart.md).

## Common Patterns

- Pass only app-specific fields to `init<TCustomContext>()`; the Nest wrapper automatically adds `NestBaseContext`.
- Resolve regular providers with `ctx.nest.get(Token)` and request-scoped/transient providers with `await ctx.nest.resolve(Token)`.
- Call `setGlobalPrefix()` before `registerAltStack()`. `respectGlobalPrefix` defaults to true and avoids double-prefixing.
- Pass `factory.defaultErrorHandlers` explicitly when using custom/default factory payloads.
- Use `createNestMiddleware()` to run an Altstack middleware function/builder in conventional Nest controller routes and carry context overrides into registered Altstack routes.
- Add `docs: { path: "/docs", title, version }` to mount Swagger UI and OpenAPI JSON.

Current caveats: only the Express Nest platform is supported. Registered routes inherit Express behavior, including synchronous output parsing and no Web `Response` passthrough. Nest/global mount prefixes do not appear automatically in generated OpenAPI path keys. Declared runtime errors are enveloped while generated error schemas are flat.

See [Server common patterns](../../apps/docs/docs/server/common-patterns.md).

## API Documentation

[NestJS API Documentation](../../apps/docs/docs/server/api/nestjs.md) covers `registerAltStack`, `RegisterAltStackOptions`, `RegisterAltStackDocsOptions`, `NestAppLike`, the Nest `init()` wrapper, `NestBaseContext`, `NestServiceLocator`, `createNestMiddleware`, `CreateNestMiddlewareOptions`, typed router helpers, and exact core re-exports.

## Peer dependencies

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`: `^9.0.0 || ^10.0.0 || ^11.0.0`
- `express`: `^4.0.0 || ^5.0.0`
- `zod`: `^4.0.0`

## License

MIT
