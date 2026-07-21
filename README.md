# Altstack

Altstack is a family of type-safe boundary libraries for command-line applications, HTTP APIs, generated SDKs, Kafka events, background jobs, and explicit error handling. Define contracts with Zod, validate data at the edge, and use only the adapters your application needs.

## Quickstart: a Hono API

```bash
mkdir altstack-hello && cd altstack-hello
pnpm init
pnpm pkg set type=module
mkdir -p src
pnpm add @alt-stack/server-hono hono zod @hono/node-server
pnpm add -D tsx typescript @types/node
```

Create `src/server.ts`:

```typescript
import {
  createServer,
  init,
  ok,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { serve } from "@hono/node-server";
import { z } from "zod";

const internalErrorSchema = z.object({
  _tag: z.literal("InternalServerError"),
  message: z.string(),
  details: z.array(z.string()),
});

const t = init<HonoBaseContext>({
  default500Error: () => [
    internalErrorSchema,
    {
      _tag: "InternalServerError" as const,
      message: "Internal server error",
      details: [],
    },
  ],
});

const api = t.router({
  "/hello/{name}": t.procedure
    .input({ params: z.object({ name: z.string().min(1) }) })
    .output(z.object({ message: z.string() }))
    .get(({ input }) => ok({ message: `Hello, ${input.params.name}!` })),
});

const app = createServer(
  { "/api": api },
  { defaultErrorHandlers: t.defaultErrorHandlers },
);

serve({ fetch: app.fetch, port: 3000 });
```

Run it with `pnpm exec tsx src/server.ts`, then open `http://localhost:3000/api/hello/Ada`. The handler receives validated input and returns an Altstack `Result`; the adapter validates output before serialization. The explicit 500 handler keeps thrown messages and stacks out of production responses—the current adapter fallback includes both.

## Choose a family

| Need | Packages |
| --- | --- |
| typed expected failures | `@alt-stack/result` |
| typed nested command-line applications | `@alt-stack/cli` |
| framework-neutral HTTP contracts | `@alt-stack/server-core` |
| HTTP runtime adapters | `@alt-stack/server-hono`, `@alt-stack/server-express`, `@alt-stack/server-bun`, `@alt-stack/server-nestjs`, `@alt-stack/server-tanstack-start` |
| generated-contract HTTP clients | `@alt-stack/http-client-core`, `@alt-stack/http-client-fetch`, `@alt-stack/http-client-ky`, and Rust crate `http-client-rust-tokio` |
| typed Kafka procedures and clients | `@alt-stack/kafka-core`, `@alt-stack/kafka-client-core`, `@alt-stack/kafka-client-kafkajs`, `@alt-stack/kafka-client-warpstream` |
| typed background jobs and clients | `@alt-stack/workers-core`, `@alt-stack/workers-trigger`, `@alt-stack/workers-warpstream`, `@alt-stack/workers-client-core`, `@alt-stack/workers-client-trigger`, `@alt-stack/workers-client-warpstream` |
| OpenAPI SDK generation | `@alt-stack/zod-openapi`, Python package `python-pydantic-openapi`, and Rust crates `rust-openapi` and `rust-openapi-crate-gen` |
| AsyncAPI SDK generation | `@alt-stack/zod-asyncapi` |
| structured Zod failures | `@alt-stack/zod-error` |

See [Choose your packages](https://altstack-docs.vercel.app/start/package-map) for peer dependencies, supported adapters, and generated/internal package distinctions.

## The complete contract loop

1. Define an HTTP, topic, or job router with Zod schemas.
2. Validate incoming data before application logic.
3. At HTTP boundaries, return tagged `Result` errors for declared failures. In the current Kafka and worker runtimes, throw when processing must fail or retry; a returned `Err` is not interpreted as a provider failure.
4. Generate OpenAPI or AsyncAPI from the owning router.
5. Generate TypeScript/Zod, Python/Pydantic, or Rust SDK artifacts.
6. Use generated client types and each adapter's available runtime validation. TypeScript HTTP clients validate declared path/query/body inputs and declared response statuses, but not headers or undeclared 2xx bodies. Generated Rust HTTP clients rely on Rust types and Serde rather than an OpenAPI validation pass.

The pieces remain independently useful: generators accept compatible documents from non-Altstack servers, and server/worker packages do not require generated clients.

## Documentation

The canonical site is [altstack-docs.vercel.app](https://altstack-docs.vercel.app/).

- [Result](https://altstack-docs.vercel.app/result/quickstart)
- [CLI](https://altstack-docs.vercel.app/cli/quickstart)
- [Servers](https://altstack-docs.vercel.app/server/quickstart)
- [HTTP clients](https://altstack-docs.vercel.app/http-client/quickstart)
- [Kafka](https://altstack-docs.vercel.app/kafka/quickstart)
- [Workers](https://altstack-docs.vercel.app/workers/quickstart)
- [Schema and SDK generation](https://altstack-docs.vercel.app/codegen/quickstart)
- [Utilities](https://altstack-docs.vercel.app/utilities/quickstart)
- [Altstack Together](https://altstack-docs.vercel.app/together/quickstart)

Each family is organized as Quickstart, Common Patterns, and API Documentation derived from the current public source.

## Repository development

Repository development requires Node.js 20.19+ or 22.12+ and pnpm 10 because the locked docs/lint toolchain is stricter than several library manifests. Rust and Python packages have their own toolchain requirements documented in their package directories.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check-types
pnpm lint
```

Documentation verification:

```bash
pnpm --filter docs-altstack-server check-docs
pnpm --filter docs-altstack-server build
```

Focused package tests live beside their source. External-service examples may additionally require Kafka/WarpStream or Trigger.dev credentials.

## Security

Report vulnerabilities through the process in [SECURITY.md](./SECURITY.md).

## License

MIT
