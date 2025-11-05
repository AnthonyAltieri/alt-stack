# Example

A complete example demonstrating the full-stack type safety of Altstack. This example shows a Todo API server and how to consume it with zero boilerplate and full type inference.

## Server Implementation

Let's build a type-safe Todo API. Notice how TypeScript infers everything from our Zod schemas:

```typescript
import { init, createServer } from "@alt-stack/server";
import { z } from "zod";

// Define app context
interface AppContext {
  user: User | null;
}

const factory = init<AppContext>();
const router = factory.router()
  // Get all todos with optional filtering
  .get("/", {
    input: {
      query: z.object({
        completed: z.enum(["true", "false"]).optional(),
      }),
    },
    output: z.array(TodoSchema),
  })
  .handler((ctx) => {
    // ✅ ctx.input.completed is typed as "true" | "false" | undefined
    // ✅ Return type is automatically inferred from output schema
    let todos = todoStore.getAll();
    
    if (ctx.input.completed === "true") {
      todos = todos.filter((t) => t.completed);
    }
    
    return todos; // TypeScript knows this matches z.array(TodoSchema)
  })
  
  // Get single todo
  .get("/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: TodoSchema,
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    // ✅ ctx.input.id is typed as string (from params)
    // ✅ ctx.error() only accepts the 404 error schema
    const todo = todoStore.getById(ctx.input.id);
    
    if (!todo) {
      throw ctx.error({
        // ✅ TypeScript ensures code is "NOT_FOUND"
        // ✅ Status code (404) is automatically inferred!
        error: {
          code: "NOT_FOUND",
          message: `Todo with id ${ctx.input.id} not found`,
        },
      });
    }
    
    return todo; // ✅ Return type matches TodoSchema
  })
  
  // Create todo
  .post("/", {
    input: {
      body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    },
    output: TodoSchema,
  })
  .handler((ctx) => {
    // ✅ ctx.input.title is string
    // ✅ ctx.input.description is string | undefined
    return todoStore.create({
      title: ctx.input.title,
      description: ctx.input.description,
    });
  });

const app = createServer(
  { todos: router },
  { createContext }
);
```

**Notice what we didn't write:**
- No type definitions for request/response
- No manual validation code
- No error response type definitions
- No status code mappings

TypeScript infers everything from the Zod schemas!

## Type Inference in Action

The power of Altstack is in the type inference. Let's see what TypeScript knows:

```typescript
.handler((ctx) => {
  // ✅ ctx.input.id - string (from params)
  // ✅ ctx.input.title - string (from body)
  // ✅ ctx.input.description - string | undefined (from body)
  // ✅ ctx.input.completed - "true" | "false" | undefined (from query)
  
  // ✅ Return type is inferred from output schema
  // ✅ TypeScript will error if return doesn't match TodoSchema
});
```

## Middleware and Type Narrowing

Altstack supports context narrowing through middleware (tRPC-style pattern):

```typescript
const factory = init<AppContext>();
const protectedRouter = factory.router()
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }),
    errors: {
      401: z.object({
        error: z.object({
          code: z.literal("UNAUTHORIZED"),
          message: z.string(),
        }),
      }),
    },
  })
  .use(async function isAuthed(opts) {
    const { ctx } = opts;
    
    // ctx.user is nullable here
    if (!ctx.user) {
      throw opts.ctx.error({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }
    
    // ✅ Pass updated context - TypeScript narrows user to non-null
    return opts.next({
      ctx: {
        user: ctx.user, // Now known to be non-null
      },
    });
  })
  .handler((ctx) => {
    // ✅ After middleware, ctx.user is guaranteed non-null
    // TypeScript can infer this even though it can't track through next()
    return {
      id: ctx.user.id,     // ✅ TypeScript knows user exists
      email: ctx.user.email,
      name: ctx.user.name,
    };
  });
```

The `next({ ctx: { user } })` pattern ensures both runtime safety and TypeScript type narrowing.

## Client Consumption

Consume the API with full type safety using the generated types:

### Step 1: Generate Types

First, generate Request/Response types from your server (see [Server Integration](/client/guides/server-integration)):

```typescript
// generate-types.ts
import { generateOpenAPISpec } from "@alt-stack/server";
import { openApiToZodTsCode } from "@alt-stack/zod-openapi";

const openApiSpec = generateOpenAPISpec({ todos: router }, {
  title: "Todo API",
  version: "1.0.0",
});

const generatedCode = openApiToZodTsCode(openApiSpec, undefined, {
  includeRoutes: true,
});

// This creates Request and Response objects with Zod schemas
```

### Step 2: Create Client

```typescript
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,  // ✅ Type-safe request schemas
  Response, // ✅ Type-safe response schemas
});
```

### Step 3: Make Type-Safe API Calls

```typescript
// Get all todos
const result = await client.get("/todos/", {
  query: {
    completed: "true", // ✅ TypeScript knows this is "true" | "false" | undefined
  },
});

if (result.success) {
  // ✅ result.data is typed as Todo[]
  result.data.forEach(todo => {
    console.log(todo.title);      // ✅ TypeScript autocomplete
    console.log(todo.completed);  // ✅ TypeScript knows this exists
  });
} else {
  // ✅ result.error is typed based on possible error responses
  if (result.error.type === "error") {
    console.error(result.error.code, result.error.message);
  }
}

// Get single todo
const todoResult = await client.get("/todos/{id}", {
  params: {
    id: "123", // ✅ TypeScript knows this must be a string
  },
});

if (todoResult.success) {
  // ✅ todoResult.data is typed as Todo
  console.log(todoResult.data.title);
  console.log(todoResult.data.description); // ✅ Optional, typed as string | undefined
} else {
  // ✅ todoResult.error is typed based on error schemas
  // TypeScript knows it could be 404 NOT_FOUND error
  if (todoResult.code === "404") {
    console.error(todoResult.error.error.message); // ✅ Typed!
  }
}

// Create todo
const createResult = await client.post("/todos/", {
  body: {
    title: "Buy groceries", // ✅ TypeScript requires string, min length 1
    description: "Milk and eggs", // ✅ Optional string
  },
});

if (createResult.success) {
  // ✅ createResult.data is typed as Todo
  console.log(createResult.data.id);
}
```

## Key Takeaways

### Zero Boilerplate
- No manual type definitions - Zod schemas are the source of truth
- No validation code - automatic runtime validation
- No error response types - inferred from error schemas

### Full Type Safety
- `ctx.input` is fully typed based on your schemas
- Return types are validated and inferred
- Error handling is type-safe with status code inference

### Type Narrowing
- Middleware can narrow context types
- `next({ ctx })` pattern enables type narrowing
- TypeScript tracks types through the request lifecycle

### End-to-End Types
- Server types flow to client via OpenAPI generation
- Client has the same type safety as server
- Single source of truth (Zod schemas)

## Try It Yourself

The complete example server is available in the repository:
- **Server**: `apps/example-altstack-server/`
- Run it: `pnpm --filter example-altstack-server dev`

The server demonstrates:
- Full CRUD operations
- Query parameter filtering
- Error handling
- Protected routes with authentication
- Middleware with type narrowing

See the [Installation Guide](/getting-started/installation) to get started building your own type-safe API!

