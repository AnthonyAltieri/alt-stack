# Real Life Example

A complete example showing how to use all Alt-stack packages together in a production-like setup.

## Overview

This example demonstrates a task management system with:

- **2 Backend Services** (Hono): Authentication and business logic
- **Background Workers** (WarpStream): Notifications and report generation
- **NextJS Frontend**: Consumes both services via generated SDKs
- **Type-safe SDKs**: Generated from OpenAPI/AsyncAPI specs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          NextJS Web App                          │
│              (uses http-client-ky + generated SDKs)              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │   backend-auth    │   │   backend-logic   │
        │   (Hono server)   │   │   (Hono server)   │
        │                   │   │                   │
        │ - POST /signup    │◄──│ validates tokens  │
        │ - POST /login     │   │                   │
        │ - POST /logout    │   │ - GET/POST /tasks │
        │ - GET /me         │   │ - PUT/DELETE /{id}│
        │ - GET /validate   │   │                   │
        └───────────────────┘   └─────────┬─────────┘
                                          │
                                          │ triggers jobs
                                          ▼
                                ┌───────────────────┐
                                │     WarpStream    │
                                │     Workers       │
                                │                   │
                                │ - send-notification│
                                │ - generate-report │
                                └───────────────────┘
```

## What You'll Learn

| Topic | Description |
|-------|-------------|
| [Project Structure](./project-structure) | Monorepo layout and package organization |
| [Auth Service](./auth-service) | Building the authentication service |
| [Logic Service](./logic-service) | Business logic with auth integration |
| [Workers](./workers) | Background job processing with WarpStream |
| [Frontend](./frontend) | NextJS app with SDK consumption |
| [SDK Generation](./sdk-generation) | Generating and using type-safe SDKs |

## Quick Start

```bash
# Clone and navigate to example
cd examples/real-life

# Install dependencies
pnpm install

# Generate SDKs
pnpm generate:all

# Start all services (in separate terminals)
pnpm --filter @real-life/backend-auth dev   # Port 3001
pnpm --filter @real-life/backend-logic dev  # Port 3002
pnpm --filter @real-life/workers dev
pnpm --filter @real-life/web dev            # Port 3000
```

## Technologies Used

| Package | Technology | Purpose |
|---------|------------|---------|
| `@alt-stack/server-hono` | Hono | Type-safe HTTP servers |
| `@alt-stack/workers-warpstream` | WarpStream/Kafka | Background job processing |
| `@alt-stack/workers-client-warpstream` | WarpStream/Kafka | Job triggering |
| `@alt-stack/zod-openapi` | OpenAPI | REST API SDK generation |
| `@alt-stack/zod-asyncapi` | AsyncAPI | Worker SDK generation |
| `@alt-stack/http-client-ky` | ky | Type-safe HTTP client with SDK integration |
| `Next.js` | React | Frontend framework |

