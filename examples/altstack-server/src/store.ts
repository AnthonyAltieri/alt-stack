import { z } from "zod";

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  createdAt: z.string(),
  userId: z.string(),
});

export type Todo = z.infer<typeof TodoSchema>;

class TodoStore {
  private todos: Map<string, Todo> = new Map();
  private nextId = 1;

  getAll(): Todo[] {
    return Array.from(this.todos.values());
  }

  getById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(data: { title: string; description?: string; userId: string }): Todo {
    const now = new Date().toISOString();
    const todo: Todo = {
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description,
      completed: false,
      createdAt: now,
      userId: data.userId,
    };
    this.todos.set(todo.id, todo);
    return todo;
  }

  update(
    id: string,
    data: Partial<{ title: string; description: string; completed: boolean }>,
  ): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) {
      return undefined;
    }
    const updated: Todo = {
      ...todo,
      ...data,
    };
    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }
}

export const todoStore = new TodoStore();

// Helper functions matching the kitchen sink example
export function getAllTodos(): Todo[] {
  return todoStore.getAll();
}

export function getTodoById(id: string): Todo | null {
  return todoStore.getById(id) ?? null;
}

export function createTodo(data: {
  title: string;
  description?: string;
  userId: string;
}): Todo {
  return todoStore.create(data);
}

export function updateTodo(
  id: string,
  data: { title?: string; description?: string; completed?: boolean },
): Todo {
  const updated = todoStore.update(id, data);
  if (!updated) {
    throw new Error(`Todo with id ${id} not found`);
  }
  return updated;
}

export function deleteTodo(id: string): void {
  todoStore.delete(id);
}
