type MetadataKey = string | symbol;
type MetadataMap = Map<MetadataKey, unknown>;

const metadataStore = new WeakMap<object, Map<PropertyKey | undefined, MetadataMap>>();

function getTargetMap(target: object): Map<PropertyKey | undefined, MetadataMap> {
  let targetMap = metadataStore.get(target);
  if (!targetMap) {
    targetMap = new Map();
    metadataStore.set(target, targetMap);
  }
  return targetMap;
}

function getMetadataMap(target: object, propertyKey?: PropertyKey): MetadataMap {
  const targetMap = getTargetMap(target);
  let meta = targetMap.get(propertyKey);
  if (!meta) {
    meta = new Map();
    targetMap.set(propertyKey, meta);
  }
  return meta;
}

function defineMetadata(
  metadataKey: MetadataKey,
  metadataValue: unknown,
  target: object,
  propertyKey?: PropertyKey,
): void {
  getMetadataMap(target, propertyKey).set(metadataKey, metadataValue);
}

function getMetadata(
  metadataKey: MetadataKey,
  target: object,
  propertyKey?: PropertyKey,
): unknown {
  let current: object | null = target;
  while (current) {
    const targetMap = metadataStore.get(current);
    const meta = targetMap?.get(propertyKey);
    if (meta && meta.has(metadataKey)) return meta.get(metadataKey);
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function getOwnMetadata(
  metadataKey: MetadataKey,
  target: object,
  propertyKey?: PropertyKey,
): unknown {
  const targetMap = metadataStore.get(target);
  return targetMap?.get(propertyKey)?.get(metadataKey);
}

function hasMetadata(
  metadataKey: MetadataKey,
  target: object,
  propertyKey?: PropertyKey,
): boolean {
  return getMetadata(metadataKey, target, propertyKey) !== undefined;
}

function hasOwnMetadata(
  metadataKey: MetadataKey,
  target: object,
  propertyKey?: PropertyKey,
): boolean {
  const targetMap = metadataStore.get(target);
  return targetMap?.get(propertyKey)?.has(metadataKey) ?? false;
}

function getMetadataKeys(target: object, propertyKey?: PropertyKey): MetadataKey[] {
  const keys = new Set<MetadataKey>();
  let current: object | null = target;
  while (current) {
    const targetMap = metadataStore.get(current);
    const meta = targetMap?.get(propertyKey);
    if (meta) {
      for (const key of meta.keys()) keys.add(key);
    }
    current = Object.getPrototypeOf(current);
  }
  return Array.from(keys);
}

function getOwnMetadataKeys(target: object, propertyKey?: PropertyKey): MetadataKey[] {
  const targetMap = metadataStore.get(target);
  const meta = targetMap?.get(propertyKey);
  return meta ? Array.from(meta.keys()) : [];
}

function metadata(metadataKey: MetadataKey, metadataValue: unknown) {
  return (target: object, propertyKey?: PropertyKey) => {
    defineMetadata(metadataKey, metadataValue, target, propertyKey);
  };
}

const ReflectShim = globalThis.Reflect as typeof Reflect & {
  defineMetadata?: typeof defineMetadata;
  getMetadata?: typeof getMetadata;
  getOwnMetadata?: typeof getOwnMetadata;
  hasMetadata?: typeof hasMetadata;
  hasOwnMetadata?: typeof hasOwnMetadata;
  getMetadataKeys?: typeof getMetadataKeys;
  getOwnMetadataKeys?: typeof getOwnMetadataKeys;
  metadata?: typeof metadata;
};

if (!ReflectShim.defineMetadata) {
  ReflectShim.defineMetadata = defineMetadata;
  ReflectShim.getMetadata = getMetadata;
  ReflectShim.getOwnMetadata = getOwnMetadata;
  ReflectShim.hasMetadata = hasMetadata;
  ReflectShim.hasOwnMetadata = hasOwnMetadata;
  ReflectShim.getMetadataKeys = getMetadataKeys;
  ReflectShim.getOwnMetadataKeys = getOwnMetadataKeys;
  ReflectShim.metadata = metadata;
}
