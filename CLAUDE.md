# Testnet Router — working notes

pnpm workspace monorepo (Node ≥ 20, pnpm 9). Packages are consumed as TypeScript source (`main: src/index.ts`); Next transpiles them via `transpilePackages`. No build step for packages.

## Commands

- `pnpm test` — vitest over `packages/**/*.test.ts` (39 tests: core graph/gas/scoring/planner/engine + registry).
- `pnpm typecheck` — `tsc` per package (`pnpm --filter "./packages/*" typecheck` to skip the web app).
- `pnpm probe` — on-chain registry verification (chain ids, Multicall3, CCTP bytecode, Uniswap pools + quote).
- `pnpm discover [wallet] [preset] [mode]` — live discovery, scan and plan from the CLI. Good smoke test before touching the UI.
- `pnpm coverage [--all]` — which testnets each provider registry supports vs. our chain registry (candidates to add).
- `pnpm dev` — Next dev server on :3000 (see `.claude/launch.json`).

## Architecture rules

- `core` has no dependency on `registry`; registry data is injected (chains, assets). `registry` depends on `core` types. `providers` depends on both. Keep it that way.
- Provider adapters implement `RouteProvider` (`discover` → `quote` → `build` → `status`). `discover` must only emit edges that were confirmed live (pool with liquidity + probe quote, API route list, verified bytecode). Never emit an edge from "protocol supports chain X".
- Edges are built lazily per hop at execution time with the actual output of the previous hop; expired quotes are re-quoted, never reused.
- The Arc native asset is `NATIVE` with 18 decimals and an `erc20Mirror` (6 decimals). Use `scaleDecimals` when handing amounts to CCTP.
- Non-user-specific provider data (Circle fee tables, allowances) goes through `TtlCache` in `packages/providers/src/shared.ts`; Iris rate-limits at 40 req/s.
- Amounts are `bigint` everywhere. Zustand persistence uses a bigint-tagging replacer/reviver (`apps/web/src/lib/store.ts`).
- UI: Modular Typography (spec §30). Tokens live in `apps/web/src/app/globals.css`; no gradients, no glass, chain colors only as 10px markers.

## Gotchas

- Heredocs with many TS files in one Bash call failed to parse on this Windows/Git Bash setup; write source files with the Write tool.
- `npx` prints warnings about pnpm-only `.npmrc` keys; use `pnpm exec`.
- Across testnet liquidity is tiny (≈0.003 WETH / 8 USDC at snapshot); AMOUNT_TOO_HIGH is surfaced as "amount above available Across liquidity".
- Monad testnet WMON address from memory had no bytecode; no WRAP edge on Monad until verified.
