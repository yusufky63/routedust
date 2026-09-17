# Testnet Router — working notes

pnpm workspace monorepo (Node ≥ 20, pnpm 9). Packages are consumed as TypeScript source (`main: src/index.ts`); Next transpiles them via `transpilePackages`. No build step for packages.

## Commands

- `pnpm test` — vitest over `packages/**/*.test.ts` (56 tests: core graph/gas/scoring/planner/engine/scanner + registry + coverage).
- `pnpm typecheck` — `tsc` per package (`pnpm --filter "./packages/*" typecheck` to skip the web app).
- `pnpm probe` — on-chain registry verification (chain ids, Multicall3, CCTP bytecode, Uniswap pools + quote).
- `pnpm edges [provider-filter…]` — live discovery plus one sample quote per provider edge (e.g. `pnpm edges hyperlane uniswap-v4`). Fastest way to check an adapter.
- `pnpm discover [wallet] [preset] [mode]` — live discovery, scan and plan from the CLI. Good smoke test before touching the UI.
- `pnpm exec tsx scripts/probe-chains.ts` — verifies candidate Circle testnets (chainid.network RPC, USDC, TokenMessengerV2, Multicall3, WETH predeploy) and prints registry seeds.
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
- Monad testnet WMON address from memory had no bytecode; no WRAP edge on Monad until verified. Same for Plume (WPLUME) and Plasma (WXPL).
- Scratch scripts must live under `scripts/` (not the scratchpad) so `viem` and the workspace packages resolve under tsx.

## Providers (what each adapter relies on)

- **circle-cctp**: two edges per pair; the `:fwd` edge uses `depositForBurnWithHook` + `FORWARD_HOOK_DATA` and fees from `/v2/burn/USDC/fees/{src}/{dst}?forward=true` (`forwardFee.medium|med`, USDC minor units, deducted from the burn). `CCTP_DOMAINS[].forwarding` gates the forward edge per destination. Status: `usedNonces` or `forwardTxHash` → MINTED; a failed `forwardState` falls back to the manual `receiveMessage` claim.
- **uniswap** (v3): `Route` is single | hop (via WETH) | split (two fee tiers in one `multicall`); splits are only quoted when the best single pool shows ≥ 30 bps impact. Do not put bigints in `quote.raw` route objects.
- **uniswap-v4**: hookless ETH/USDC pools from the feed's `v4StateView`/`v4Quoter`; `execute(0x10, [abi.encode(actions 06 0c 0e, params)], deadline)` on the feed's Universal Router. ERC-20 input needs ERC-20→Permit2 approval and a `Permit2.approve(token, router, amount, expiry)` step; both are exact-amount.
- **uniswap-v2**: feed v2 deployments plus `V2_AMM_DEPLOYMENTS` (Pangolin, LFJ on Fuji). Avalanche forks expose `WAVAX()`/`swapExactAVAXForTokens`; `nativeSelector` in the edge meta picks the ABI.
- **hyperlane**: `HYPERLANE_WARP_ROUTES` (CCTP-backed collateral routers) verified with `routers(domain)` + `wrappedToken()`; `quoteTransferRemote` returns [native gas payment, amount, optional USDC fee]. The gas payment is carried as `quote.nativeFeeWei` and reserved with source gas (`GasReserveInput.extraNativeWei`). Delivery is detected by destination balance polling.
- **lifi**: pairs from `/v1/tools`, quotes from `/v1/quote` executed as returned; `No available quotes` → null quote.

## Unverified tokens (wallet-discovered / user-added)

- `discoverWalletTokens` (core) lists ERC-20s via each chain's `tokenIndexer` (Blockscout v2), re-reads `decimals()`/`balanceOf` on-chain and returns assets with `verified: false`, `representation: "UNKNOWN"`, `canonicalAssetId: "TOKEN:<address>"`.
- Planner policy: an unverified token is only routed through a swap-first path (never bridged/wrapped as-is). The Uniswap adapter probes token↔USDC and token↔WETH pools for every ERC-20 in `ctx.assets`.
- The web app merges registry + discovered + custom assets (`apps/web/src/lib/assets.ts`); every lookup must use `findAnyAsset`, not the registry's `findAsset`.
- Zustand `persist` uses a custom `merge` so new `settings` fields get defaults; add new settings to `DEFAULT_SETTINGS` only.
