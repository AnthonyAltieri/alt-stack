import { z } from "zod";

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
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

  create(data: { title: string; description?: string }): Todo {
    const now = new Date().toISOString();
    const todo: Todo = {
      id: String(this.nextId++),
      title: data.title,
      description: data.description,
      completed: false,
      createdAt: now,
      updatedAt: now,
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
      updatedAt: new Date().toISOString(),
    };
    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }
}

export const todoStore = new TodoStore();
