export function assertPlainContext(
  value: unknown,
  source: "createContext" | "middleware",
): asserts value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${source} must provide a plain context object`);
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${source} must provide a plain context object`);
  }
}
