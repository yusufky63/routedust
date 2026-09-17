# Testnet Router — working notes

pnpm workspace monorepo (Node ≥ 20, pnpm 9). Packages are consumed as TypeScript source (`main: src/index.ts`); Next transpiles them via `transpilePackages`. No build step for packages.

## Commands

- `pnpm test` — vitest over `packages/**/*.test.ts` (65 tests: core graph/gas/scoring/planner/engine/scanner + registry + coverage + LI.FI fetch + Gateway sets + CCTP expiry).
- `pnpm typecheck` — `tsc` per package (`pnpm --filter "./packages/*" typecheck` to skip the web app).
- `pnpm probe [--write]` — on-chain registry verification (chain ids, Multicall3, CCTP bytecode, Uniswap pools + quote); `--write` stamps `REGISTRY_VERIFIED_AT` after a clean run.
- `pnpm edges [provider-filter…]` — live discovery plus one sample quote per provider edge (e.g. `pnpm edges hyperlane uniswap-v4`). Fastest way to check an adapter.
- `pnpm e2e 0xWallet [preset] [maxRoutes]` — plan for a wallet, build the best routes with the real adapters and eth_call every transaction; no key needed.
- `pnpm discover [wallet] [preset] [mode]` — live discovery, scan and plan from the CLI (prints pooled bridges too).
- `pnpm exec tsx scripts/probe-chains.ts` — verifies candidate Circle testnets (chainid.network RPC, USDC, TokenMessengerV2, Multicall3, WETH predeploy) and prints registry seeds.
- `pnpm exec tsx scripts/codehash.ts` — regenerates `packages/registry/src/codehash.ts` (spender bytecode hashes) after registry changes; `scripts/probe-tokens.ts` verifies known test tokens.
- `pnpm coverage [--all]` — which testnets each provider registry supports vs. our chain registry (candidates to add).
- `pnpm dev` — Next dev server on :3000 (see `.claude/launch.json`).

## Architecture rules

- `core` has no dependency on `registry`; registry data is injected (chains, assets). `registry` depends on `core` types. `providers` depends on both. Keep it that way.
- Provider adapters implement `RouteProvider` (`discover` → `quote` → `build` → `status`). `discover` must only emit edges that were confirmed live (pool with liquidity + probe quote, API route list, verified bytecode). Never emit an edge from "protocol supports chain X".
- Edges are built lazily per hop at execution time with the actual output of the previous hop; expired quotes are re-quoted, never reused.
- The Arc native asset is `NATIVE` with 18 decimals and an `erc20Mirror` (6 decimals). Use `scaleDecimals` when handing amounts to CCTP.
- Non-user-specific provider data (Circle fee tables, allowances) goes through `TtlCache` in `packages/providers/src/shared.ts`; Iris rate-limits at 40 req/s.
- Amounts are `bigint` everywhere. Zustand persistence uses a bigint-tagging replacer/reviver (`apps/web/src/lib/store.ts`).
- UI: Modular Typography (spec §30) on a token-driven foundation. `apps/web/src/app/globals.css` defines the semantic tokens (surfaces, text tones, `--shadow-*`, `--radius-*`, `--module-pad`), the Tailwind type scale (xs 11 / sm 13 / base 15 / lg 17 … 5xl 44, `tracking-caps|label|brand`) and the component classes in `@layer components` (`.module*`, `.popover(-item)`, `.btn*`, `.link-action`, `.nav-link`, `.tag*`, `.table`, `.label`, `.meta`). Utilities override component classes without `!`; never add `text-[11px]`-style one-offs or per-card `p-*` exceptions. DM Sans for copy, buttons and nav; mono uppercase only for labels, tags and metadata. No gradients, no glass, chain colors only as 10px markers. The theme is set before paint by the inline script in `layout.tsx`.

## Gotchas

- Heredocs with many TS files in one Bash call failed to parse on this Windows/Git Bash setup; write source files with the Write tool.
- `npx` prints warnings about pnpm-only `.npmrc` keys; use `pnpm exec`.
- Across testnet liquidity is tiny (≈0.003 WETH / 8 USDC at snapshot); AMOUNT_TOO_HIGH is surfaced as "amount above available Across liquidity".
- Monad testnet WMON address from memory had no bytecode; no WRAP edge on Monad until verified. Same for Plume (WPLUME) and Plasma (WXPL).
- Scratch scripts must live under `scripts/` (not the scratchpad) so `viem` and the workspace packages resolve under tsx.
- `/api/feeds/uniswap` and `/api/discovery` are cached (browser 60 s / server 5 min). After changing what the proxy keeps, a full page reload is needed; provider modules also hold `feedCache` for 15 min in memory.
- Discovery in the browser comes from `/api/discovery` (server, shared). Client-side discovery runs only for wallet-specific unverified tokens or with RPC overrides.
- Own gas faucet: `DRIP_CHAINS` (registry `drip.ts`) + `FAUCET_AMOUNTS` env; server logic only in `apps/web/src/lib/server/faucet.ts` (`server-only`), route `/api/faucet`. Order: Turnstile verify → recipient balance < drip → faucet balance ≥ drip + 2×transfer gas → SET NX per address and per hashed IP (24 h) → daily cap INCR → per-chain send lock → send; any failure after reserving rolls the keys back. Memory store is dev-only; production needs Upstash/KV. The key never leaves that module.
- Web UI: pickers are custom `Select`s (`components/ui.tsx`), not chip grids; the user asked for a compact home page. History is archived, never deleted. Activity is tables (batches, routes), not cards. `RouteExecution.origin` ("router" | "swap") decides where the route page's back button leads.

## Providers (what each adapter relies on)

- **circle-cctp**: two edges per pair; the `:fwd` edge uses `depositForBurnWithHook` + `FORWARD_HOOK_DATA` and fees from `/v2/burn/USDC/fees/{src}/{dst}?forward=true` (`forwardFee.medium|med`, USDC minor units, deducted from the burn). `CCTP_DOMAINS[].forwarding` gates the forward edge per destination. Status: `usedNonces` or `forwardTxHash` → MINTED; a failed `forwardState` falls back to the manual `receiveMessage` claim. A Fast Transfer attestation expires at the message's `expirationBlock` (burn body word 7, read by `cctpExpirationBlock`; destination-chain block, Ethereum Sepolia's for Arbitrum): `status` then POSTs `/v2/reattest/{eventNonce}` (at most every 5 min, `reattestAt` persisted) and keeps polling.
- **uniswap** (v3): `Route` is single | hop (via WETH) | split (two fee tiers in one `multicall`); splits are only quoted when the best single pool shows ≥ 30 bps impact. Do not put bigints in `quote.raw` route objects.
- **uniswap-v4**: hookless ETH/USDC pools from the feed's `v4StateView`/`v4Quoter`; `execute(0x10, [abi.encode(actions 06 0c 0e, params)], deadline)` on the feed's Universal Router. ERC-20 input needs ERC-20→Permit2 approval and a `Permit2.approve(token, router, amount, expiry)` step; both are exact-amount.
- **uniswap-v2**: feed v2 deployments plus `V2_AMM_DEPLOYMENTS` (Pangolin, LFJ on Fuji). Avalanche forks expose `WAVAX()`/`swapExactAVAXForTokens`; `nativeSelector` in the edge meta picks the ABI.
- **hyperlane**: `HYPERLANE_WARP_ROUTES` (CCTP-backed collateral routers) verified with `routers(domain)` + `wrappedToken()`; `quoteTransferRemote` returns [native gas payment, amount, optional USDC fee]. The gas payment is carried as `quote.nativeFeeWei` and reserved with source gas (`GasReserveInput.extraNativeWei`). Delivery: destination balance increase, or `hyperlaneDelivery` (public explorer GraphQL `api.hyperlane.xyz/v1/graphql`, `origin_tx_hash` as bytea `\x…`) which also gives the destination tx.
- **lifi**: pairs from `/v1/tools` (no `chains=` filter: unknown ids fail the whole request), quotes from `/v1/quote` executed as returned; `No available quotes` → null quote.  Server-side `lifiFetch` adds key/integrator/fee; when LI.FI answers 1011 (integrator not set up for fees in the partner portal) the fee is dropped for 30 min so quotes keep working. ERC-20 legs without an address (Arc native USDC) are not emitted.
- **circle-gateway**: `CIRCLE_GATEWAY_TESTNET` (same wallet/minter address on every chain, domains = CCTP domains). Steps: approve → `deposit(token,value)` → WAIT `finality` (POST `/v1/balances` until available ≥ before + amount) → PERMIT (EIP-712 `BurnIntent`, domain `{name:"GatewayWallet",version:"1"}` without chainId/verifyingContract, `maxBlockHeight` = uint256 max) → WAIT `transfer` (POST `/v1/transfer?enableForwarder=true` once, `transferId` persisted via `status.persist`, then GET `/v1/transfer/{id}`). Fee from `/v1/estimate?enableForwarder=true` is deducted from the deposit. The finality wait re-estimates and returns `nextPermit`, so the signed maxFee is seconds old. **Sets**: `offerGatewaySet(plan)` → deposit legs (`meta.role: "deposit"`, approve + deposit only) plus one collector (`role: "collect"`, no transaction): waits for every deposit's finality, signs ONE `BurnIntentSet(BurnIntent[] intents)` (typehash checked in the tests against BurnIntents.sol), one forwarded mint. The forwarding fee is charged once per request and lands on the first intent, so the largest source goes first; sources below their own fee are dropped; max 16 intents. `pnpm exec tsx scripts/gateway-set.ts` checks the estimate and that Circle accepts the signatures (throwaway key).
- **stargate**: `STARGATE_NATIVE_POOLS` (ETH only; Stargate's testnet USDC is a mock token). `quoteOFT` caps → `QuoteLimitError`; `sendToken` with `msg.value = amount + nativeFee`, `oftCmd 0x` (taxi), `extraOptions 0x` (enforced options exist); delivery via `scan-testnet.layerzero-api.com/v1/messages/tx/{hash}`.

## Executor guarantees (keep them)

- `TxStep.nonce`/`startBlock` are recorded before every signature. On retry, `guardDuplicate` compares the wallet's latest nonce: moved → `provider.recover()` (CCTP scans `DepositForBurn` logs) or, for CLAIM steps, `provider.status()`; unresolved → `POSSIBLE_DUPLICATE` and the route page's resolver (paste hash / mark unrelated). Never bypass this for burns.
- `WALLET_DISCONNECTED` → state `PAUSED` (steps kept). `waitForTransactionReceipt` follows replacements (`onReplaced`).
- `checkGasBudget` (gas × fee + OP Stack `getL1Fee` + value vs balance) and `checkContractCode` (bytecode hash pins: `KNOWN_CODE_HASHES` + browser pins) run before each signature.
- Balance mode (`amountMode: "balance"`, `amountCap`) is how the pooled bridge leg of a ChainGroup starts with what the legs delivered.
- PERMIT steps are signed with `signer.signTypedData`; the signature lands in the next WAIT step's `poll.permitSignature`; `status.persist` merges into `poll`. A terminal wait status may carry `nextPermit` (fresh typed data + poll for the following PERMIT/WAIT). An edge without transaction steps may wait with no source tx (zero hash).

## Unverified tokens (wallet-discovered / user-added)

- `discoverWalletTokens` (core) lists ERC-20s via each chain's `tokenIndexer` (Blockscout v2), re-reads `decimals()`/`balanceOf` on-chain and returns assets with `verified: false`, `representation: "UNKNOWN"`, `canonicalAssetId: "TOKEN:<address>"`.
- Planner policy: an unverified token is only routed through a swap-first path (never bridged/wrapped as-is). The Uniswap adapter probes token↔USDC and token↔WETH pools for every ERC-20 in `ctx.assets`.
- The web app merges registry + discovered + custom assets (`apps/web/src/lib/assets.ts`); every lookup must use `findAnyAsset`, not the registry's `findAsset`.
- Zustand `persist` uses a custom `merge` so new `settings` fields get defaults; add new settings to `DEFAULT_SETTINGS` only.
