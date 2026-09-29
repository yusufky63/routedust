"use client";

import { useCallback, useState, type SetStateAction } from "react";

const memory = new Map<string, unknown>();

/**
 * useState that outlives the page while you move around the app (search,
 * filters, selection), but not a reload. `key` must be unique per value.
 */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        memory.set(key, v);
        return v;
      }),
    [key],
  );
  return [value, set] as const;
}
