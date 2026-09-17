import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The repo keeps one .env at its root (git-ignored). Next.js only reads env
 * files next to the app, so the root file is loaded here for local
 * development; on Vercel the same names are project environment variables.
 * Nothing here is ever exposed to the browser (no NEXT_PUBLIC_ prefix).
 */
function loadRootEnv(): void {
  const file = resolve(process.cwd(), "..", "..", ".env");
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
loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@testnet-router/core", "@testnet-router/registry", "@testnet-router/providers"],
  outputFileTracingRoot: resolve(process.cwd(), "..", ".."),
};

export default nextConfig;
