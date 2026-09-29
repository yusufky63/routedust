"use client";

import type { RouteExecution } from "@testnet-router/core";
import { bigintReplacer, bigintReviver } from "./bigint-json";

/**
 * Records that must survive tabs and reloads (executions, batches, rollup
 * withdrawals) are stored one localStorage key each, not inside the main
 * persisted blob: a second tab rewriting the blob can then never drop an
 * execution the first tab created, or the txHash / nonce of a step it just
 * sent. Writes never throw: a full quota must not abort a route mid-signature.
 */

export type RecordKind = "exec" | "batch" | "withdrawal";

const PREFIX = "testnet-router:";
/** Log lines kept per execution; older lines are dropped (the steps carry the facts). */
const MAX_LOG_LINES = 200;
/** A finished execution keeps its last lines only. */
const FINISHED_LOG_LINES = 20;

function keyOf(kind: RecordKind, id: string): string {
  return `${PREFIX}${kind}:${id}`;
}

export function parseRecordKey(key: string | null): { kind: RecordKind; id: string } | undefined {
  if (!key?.startsWith(PREFIX)) return undefined;
  const [kind, ...rest] = key.slice(PREFIX.length).split(":");
  if ((kind === "exec" || kind === "batch" || kind === "withdrawal") && rest.length > 0) return { kind, id: rest.join(":") };
  return undefined;
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseRecord<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw, bigintReviver) as T;
  } catch {
    return undefined;
  }
}

export function readRecords<T>(kind: RecordKind): Record<string, T> {
  const out: Record<string, T> = {};
  const s = storage();
  if (!s) return out;
  for (let i = 0; i < s.length; i += 1) {
    const parsed = parseRecordKey(s.key(i));
    if (!parsed || parsed.kind !== kind) continue;
    const value = parseRecord<T>(s.getItem(keyOf(kind, parsed.id)));
    if (value !== undefined) out[parsed.id] = value;
  }
  return out;
}

export function readRecord<T>(kind: RecordKind, id: string): T | undefined {
  return parseRecord<T>(storage()?.getItem(keyOf(kind, id)) ?? null);
}

/** A finished route no longer needs provider payloads or a long log; the steps and hashes stay. */
export function compactExecution(ex: RouteExecution): RouteExecution {
  const finished = ex.state === "COMPLETED" || ex.archivedAt !== undefined;
  const log = ex.log.slice(-(finished ? FINISHED_LOG_LINES : MAX_LOG_LINES));
  if (!finished) return log.length === ex.log.length ? ex : { ...ex, log };
  return {
    ...ex,
    log,
    candidate: { ...ex.candidate, edges: ex.candidate.edges.map((e) => ({ ...e, quote: { ...e.quote, raw: undefined } })) },
  };
}

let quotaWarned = false;

/**
 * Records whose own key could not be written ("kind:id"). The store keeps
 * these inside its persisted blob as a fallback until a later write succeeds.
 */
export const unsavedRecords = new Set<string>();

function write(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Frees space by compacting every finished execution on disk. */
function compactStoredExecutions(): void {
  const all = readRecords<RouteExecution>("exec");
  for (const [id, ex] of Object.entries(all)) {
    const compact = compactExecution(ex);
    if (compact !== ex) write(keyOf("exec", id), JSON.stringify(compact, bigintReplacer));
  }
}

/** True when the record reached its own key. Never throws. */
export function writeRecord(kind: RecordKind, id: string, value: unknown): boolean {
  const body = kind === "exec" ? compactExecution(value as RouteExecution) : value;
  const json = JSON.stringify(body, bigintReplacer);
  const tag = `${kind}:${id}`;
  if (write(keyOf(kind, id), json) || (compactStoredExecutions(), write(keyOf(kind, id), json))) {
    unsavedRecords.delete(tag);
    return true;
  }
  unsavedRecords.add(tag);
  if (!quotaWarned) {
    quotaWarned = true;
    console.warn("RouteDust: browser storage is full; new progress cannot be saved until space is freed (clear old site data). Routes will not ask for a signature meanwhile.");
  }
  return false;
}

export function removeRecord(kind: RecordKind, id: string): void {
  try {
    storage()?.removeItem(keyOf(kind, id));
  } catch {
    // nothing to free
  }
}

/** localStorage for zustand persist that never throws on a full quota. */
export const safeLocalStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (name) => storage()?.getItem(name) ?? null,
  setItem: (name, value) => {
    if (write(name, value)) return;
    compactStoredExecutions();
    if (!write(name, value) && !quotaWarned) {
      quotaWarned = true;
      console.warn("RouteDust: browser storage is full; settings are kept in memory only until space is freed.");
    }
  },
  removeItem: (name) => {
    try {
      storage()?.removeItem(name);
    } catch {
      // nothing to free
    }
  },
};
