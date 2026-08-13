export type BoundedJsonValue =
  | string
  | number
  | boolean
  | null
  | BoundedJsonValue[]
  | { [key: string]: BoundedJsonValue };

export const BOUNDED_JSON_MAX_DEPTH = 6;
export const BOUNDED_JSON_MAX_ENTRIES = 100;
export const BOUNDED_JSON_MAX_STRING_LENGTH = 10_000;
export const BOUNDED_JSON_MAX_BYTES = 64 * 1024;

export interface BoundedJsonOptions {
  maxBytes?: number;
  maxStringLength?: number;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedJsonValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  maxStringLength: number,
): value is BoundedJsonValue {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= maxStringLength;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > BOUNDED_JSON_MAX_DEPTH || seen.has(value)) {
    return false;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return (
      value.length <= BOUNDED_JSON_MAX_ENTRIES &&
      value.every((item) => isBoundedJsonValue(item, depth + 1, seen, maxStringLength))
    );
  }
  if (!isPlainObject(value)) return false;

  const entries = Object.entries(value);
  return (
    entries.length <= BOUNDED_JSON_MAX_ENTRIES &&
    entries.every(
      ([key, item]) =>
        key.length <= 128 &&
        !key.includes('\u0000') &&
        isBoundedJsonValue(item, depth + 1, seen, maxStringLength),
    )
  );
}

export function isBoundedJsonObject(
  value: unknown,
  options: BoundedJsonOptions = {},
): value is Record<string, BoundedJsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const maxBytes = options.maxBytes ?? BOUNDED_JSON_MAX_BYTES;
  const maxStringLength = options.maxStringLength ?? BOUNDED_JSON_MAX_STRING_LENGTH;
  if (!isBoundedJsonValue(value, 0, new WeakSet<object>(), maxStringLength)) return false;
  const serialized = JSON.stringify(value);
  return serialized !== undefined && Buffer.byteLength(serialized, 'utf8') <= maxBytes;
}
