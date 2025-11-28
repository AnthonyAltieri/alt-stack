/**
 * Example application context shared across all workers.
 */
export interface AppContext {
  /** A simple in-memory "database" for demo purposes */
  db: {
    users: Map<string, { id: string; email: string; name: string }>;
    emails: Map<string, { to: string; subject: string; sentAt: Date }>;
  };
}

// Simple in-memory store
const users = new Map<string, { id: string; email: string; name: string }>();
const emails = new Map<string, { to: string; subject: string; sentAt: Date }>();

export function createAppContext(): AppContext {
  return {
    db: {
      users,
      emails,
    },
  };
}
