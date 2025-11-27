export type AnySchema = Record<string, unknown>;

export interface AsyncAPISpec {
  asyncapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  channels?: Record<string, AsyncAPIChannel>;
  operations?: Record<string, AsyncAPIOperation>;
  components?: {
    schemas?: Record<string, AnySchema>;
    messages?: Record<string, AsyncAPIMessage>;
  };
}

export interface AsyncAPIChannel {
  address: string;
  messages?: Record<string, { $ref: string } | AsyncAPIMessage>;
}

export interface AsyncAPIOperation {
  action: "send" | "receive";
  channel: { $ref: string };
  messages?: Array<{ $ref: string }>;
}

export interface AsyncAPIMessage {
  name?: string;
  contentType?: string;
  payload?: { $ref: string } | AnySchema;
}

export interface TopicInfo {
  topic: string;
  messageName: string;
  payloadSchema: AnySchema | null;
}

