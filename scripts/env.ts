import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads the repo-root .env into process.env for scripts (never overrides
 * variables already set). Next.js does not read a .env above apps/web, so
 * next.config.ts uses the same parser.
 */
export function loadDotEnv(file = resolve(process.cwd(), ".env")): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
