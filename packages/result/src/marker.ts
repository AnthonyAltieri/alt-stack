const RESULT_BRAND = Symbol.for("@alt-stack/result/brand");

export function brandResult<T extends object>(value: T): T {
  Object.defineProperty(value, RESULT_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return value;
}

export function hasResultBrand(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as any)[RESULT_BRAND] === true;
}
