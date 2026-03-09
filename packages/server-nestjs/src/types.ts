import type { ExpressBaseContext } from "@alt-stack/server-express";

export interface NestServiceLocator {
  get<T = unknown>(token: unknown): T;
  resolve<T = unknown>(token: unknown): Promise<T>;
}

export interface NestBaseContext extends ExpressBaseContext {
  nest: NestServiceLocator;
}

