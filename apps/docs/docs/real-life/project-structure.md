# Project Structure

The real-life example is organized as a pnpm monorepo with apps and packages.

## Directory Layout

```
examples/real-life/
├── package.json           # Workspace root
├── pnpm-workspace.yaml    # Workspace config
├── apps/
│   ├── backend-auth/      # Auth service (Hono)
│   │   ├── src/
│   │   │   ├── index.ts          # Server entry
│   │   │   └── generate-spec.ts  # OpenAPI generator
│   │   ├── openapi.json          # Generated spec
│   │   └── package.json
│   │
│   ├── backend-logic/     # Business logic service (Hono)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── generate-spec.ts
│   │   ├── openapi.json
│   │   └── package.json
│   │
│   ├── workers/           # Background workers (WarpStream)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── generate-spec.ts
│   │   ├── asyncapi.json
│   │   └── package.json
│   │
│   └── web/               # NextJS frontend
│       ├── src/
│       │   ├── app/
│       │   └── lib/api.ts
│       └── package.json
│
└── packages/
    ├── backend-auth-sdk/  # Generated OpenAPI SDK
    ├── backend-logic-sdk/ # Generated OpenAPI SDK
    └── workers-sdk/       # Generated AsyncAPI SDK
```

## Package Dependencies

```
@real-life/web
├── @real-life/backend-auth-sdk
├── @real-life/backend-logic-sdk
└── ky

@real-life/backend-logic
├── @alt-stack/server-hono
├── @alt-stack/workers-client-warpstream
├── @real-life/workers-sdk
└── ky (for calling backend-auth)

@real-life/backend-auth
└── @alt-stack/server-hono

@real-life/workers
└── @alt-stack/workers-warpstream
```

## Workspace Configuration

```yaml title="pnpm-workspace.yaml"
packages:
  - "apps/*"
  - "packages/*"
```

## Scripts

```json title="package.json"
{
  "scripts": {
    "dev": "pnpm -r run dev",
    "build": "pnpm -r run build",
    "generate:all": "pnpm -r run generate"
  }
}
```

Each app has a `generate` script that:
1. Runs `generate-spec.ts` to create the JSON spec
2. Runs the corresponding SDK package's `generate` script

```json title="apps/backend-auth/package.json"
{
  "scripts": {
    "generate": "tsx src/generate-spec.ts && pnpm --filter @real-life/backend-auth-sdk generate"
  }
}
```

