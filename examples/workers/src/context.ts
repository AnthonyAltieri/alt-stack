/**
 * Example application context shared across all workers.
 */
export interface AppContext {
  /** A simple in-memory "database" for demo purposes */
  db: {
    users: Map<string, { id: string; email: string; name: string }>;
    emails: Map<string, { to: string; subject: string; sentAt: Date }>;
    // Data pipeline state
    dataImports: Map<string, {
      id: string;
      status: string;
      recordsProcessed: number;
      startedAt: Date;
    }>;
    rawRecords: Map<string, {
      id: string;
      data: Record<string, unknown>;
      importId: string;
      importedAt: Date;
    }>;
    transformedRecords: Map<string, {
      id: string;
      originalData: Record<string, unknown>;
      transformedData: Record<string, unknown>;
      transformId: string;
      transformedAt: Date;
    }>;
    exportedRecords: Map<string, {
      id: string;
      exportId: string;
      destination: string;
      format: string;
      exportedAt: Date;
    }>;
  };
}

// Simple in-memory store
const users = new Map<string, { id: string; email: string; name: string }>();
const emails = new Map<string, { to: string; subject: string; sentAt: Date }>();
const dataImports = new Map<string, {
  id: string;
  status: string;
  recordsProcessed: number;
  startedAt: Date;
}>();
const rawRecords = new Map<string, {
  id: string;
  data: Record<string, unknown>;
  importId: string;
  importedAt: Date;
}>();
const transformedRecords = new Map<string, {
  id: string;
  originalData: Record<string, unknown>;
  transformedData: Record<string, unknown>;
  transformId: string;
  transformedAt: Date;
}>();
const exportedRecords = new Map<string, {
  id: string;
  exportId: string;
  destination: string;
  format: string;
  exportedAt: Date;
}>();

export function createAppContext(): AppContext {
  return {
    db: {
      users,
      emails,
      dataImports,
      rawRecords,
      transformedRecords,
      exportedRecords,
    },
  };
}
