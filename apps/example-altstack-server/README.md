# Example Todo Server

A complete example todo application built with `@alt-stack/server`, demonstrating type-safe API endpoints with Zod validation.

## Features

- ✅ Full CRUD operations for todos
- ✅ Type-safe request/response handling
- ✅ Automatic input validation
- ✅ Type-safe error handling with `ctx.error()`
- ✅ Query parameter filtering
- ✅ In-memory data store

## API Endpoints

### GET /todos

List all todos with optional filtering.

**Query Parameters:**
- `completed` (optional): Filter by completion status (`"true"` or `"false"`)

**Example:**
```bash
curl http://localhost:3000/todos
curl http://localhost:3000/todos?completed=true
```

### GET /todos/{id}

Get a single todo by ID.

**Example:**
```bash
curl http://localhost:3000/todos/1
```

### POST /todos

Create a new todo.

**Request Body:**
```json
{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "description": "Milk, eggs, bread"}'
```

### PATCH /todos/{id}

Update an existing todo.

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "completed": true
}
```

**Example:**
```bash
curl -X PATCH http://localhost:3000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### DELETE /todos/{id}

Delete a todo by ID.

**Example:**
```bash
curl -X DELETE http://localhost:3000/todos/1
```

## Running the Server

```bash
# Install dependencies
pnpm install

# Copy environment variables (optional - defaults are provided)
cp .env.example .env

# Start the development server
pnpm dev
```

The server will start on `http://localhost:3000` (or the port specified by `PORT` environment variable).

Environment variables are validated using `@t3-oss/env-core` on startup. See `.env.example` for available configuration options.

## Type Safety

All endpoints are fully type-safe:

- **Input validation**: Request parameters, query strings, and body are validated against Zod schemas
- **Output validation**: Response data is validated against output schemas
- **Error handling**: Type-safe error throwing with `ctx.error()` - TypeScript ensures you only throw errors matching the defined error schemas
- **Full inference**: `ctx.input` is fully typed based on your input configuration

## Project Structure

```
src/
  index.ts    # Main server file with route definitions
  store.ts    # In-memory todo store
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Todo with id 1 not found"
  }
}
```

Status codes are automatically inferred from error schemas when using `ctx.error()`. Always use `throw ctx.error(...)` to throw errors.

