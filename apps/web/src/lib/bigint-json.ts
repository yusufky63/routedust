/** JSON with bigint round-tripping: `{ "__bigint__": "123" }` on the wire. Shared by the store and the API routes. */
const BIGINT_TAG = "__bigint__";

export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
  return value;
}

export function bigintReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && BIGINT_TAG in (value as Record<string, unknown>)) {
    return BigInt((value as Record<string, string>)[BIGINT_TAG] as string);
  }
  return value;
}

export function stringifyWithBigint(value: unknown): string {
  return JSON.stringify(value, bigintReplacer);
}

export function parseWithBigint<T>(text: string): T {
  return JSON.parse(text, bigintReviver) as T;
}
