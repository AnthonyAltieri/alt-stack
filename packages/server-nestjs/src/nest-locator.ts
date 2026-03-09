import type { NestAppLike } from "./register.js";
import type { NestServiceLocator } from "./types.js";

export function createNestLocator(app: NestAppLike): NestServiceLocator {
  const get = <T,>(token: unknown): T => {
    try {
      return app.get<T>(token, { strict: false });
    } catch {
      return app.get<T>(token);
    }
  };

  const resolve = async <T,>(token: unknown): Promise<T> => {
    if (typeof app.resolve === "function") {
      try {
        return await app.resolve<T>(token, undefined, { strict: false });
      } catch {
        return await app.resolve<T>(token);
      }
    }
    return get<T>(token);
  };

  return { get, resolve };
}
