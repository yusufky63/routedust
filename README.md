# RouteDust — testnet router

Live: [routedust.xyz](https://routedust.xyz) (also [routedust.vercel.app](https://routedust.vercel.app)) · Source: [github.com/yusufky63/routedust](https://github.com/yusufky63/routedust)

Multi-chain **testnet asset router and dust consolidator**. Scans a wallet across EVM testnets, discovers live swap and bridge capabilities at runtime, reserves source gas, quotes and simulates every path, and consolidates routable balances into the exact chain and asset you choose.

The product definition (from the spec) that everything here serves:

> Given a wallet with fragmented balances across testnets, determine what is actually routable right now, preserve enough gas to execute, convert local native/ERC-20 dust into useful exit assets, choose among canonical and alternative cross-chain paths, and consolidate the result into the exact chain and asset the user wants.

## Status

Phases 0–4 of the spec are implemented and verified live against the networks (see "What is live" below): Circle CCTP with the Forwarding Service, Circle Gateway, Uniswap v3/v4/v2 (and v2-style AMMs on Fuji) with split routes, Hyperlane CCTP-backed warp routes, Stargate V2 ETH pools, LI.FI intents, Across, OP Standard Bridge deposits, 20 testnets, chain consolidation (pooled bridges), and an executor that never sends a burn twice. Not implemented, deliberately: OP Stack withdrawals (L2 → L1, seven-day proof window) and Wormhole NTT (no matching testnet assets).

Pages: Router (`/`), Swap, Balances, Activity (permanent history + on-chain CCTP burn recovery), Networks (RPC health, add to wallet), Protocols, Coverage, Faucets, Liquidity (create a pool for your token), How it works, Docs, Settings.

## Layout

```
apps/web                Next.js 16 App Router UI (Modular Typography design system)
packages/core           types, capability multigraph, gas reserve, scoring, scanner, planner, execution engine
packages/registry       chains, assets (incl. EURC/LINK test tokens), faucets, CCTP domains, Gateway, Stargate, DEX + bridge + warp deployments, bytecode hashes, provenance
packages/providers      route adapters: circle-cctp (manual + forwarding), circle-gateway, uniswap (v3), uniswap-v4, uniswap-v2 (+ Pangolin/LFJ), wrap, across, op-standard-bridge, hyperlane, stargate, lifi
scripts/probe.ts        on-chain capability probe (RPC chain ids, Multicall3, CCTP, Uniswap pools); --write stamps the registry date
scripts/discover.ts     live discovery + optional wallet scan & plan from the CLI
scripts/edges.ts        live discovery + one sample quote per provider edge (pnpm edges [provider-filter…])
scripts/e2e.ts          dry run: plan for a wallet, build the best routes with the real adapters, eth_call every transaction (pnpm e2e 0xWallet)
scripts/codehash.ts     keccak256 of every spender / router bytecode → packages/registry/src/codehash.ts
scripts/probe-chains.ts / probe-tokens.ts / probe-dex.ts   candidate chain, test token and DEX verification
```

## Configuration

Copy `.env.example` to `.env` at the repo root (git-ignored). `LIFI_API_KEY` raises LI.FI's rate limits; `LIFI_FEE_*` enables the integrator fee. The browser never sees these: the app proxies li.quest through `/api/lifi`, and server-side discovery and the scripts read the file directly. On Vercel, set the same names as project environment variables.

## Deploy

The app is a pnpm monorepo; the Vercel project uses `apps/web` as its root directory (the workspace packages are pulled in through `outputFileTracingRoot`). `git push` to `main` deploys.

## Quick start

```bash
pnpm install
pnpm test                 # unit tests (core + registry)
pnpm typecheck
pnpm probe                # verify on-chain deployments against the registry
pnpm discover 0xYourWallet base-usdc BEST_OUTPUT   # scan + plan from the terminal
pnpm dev                  # http://localhost:3000
```

The web app needs an injected wallet (MetaMask, Rabby, …). All signing is client-side; there is no backend and no private key ever leaves the browser.

## Router UI

- **Watch mode**: scan and plan for any address without connecting; execution unlocks when that wallet is connected.
- **Amounts**: every route accepts 25 / 50 / 75 / MAX presets or a custom amount; the path is re-quoted live for the new amount (never scaled linearly).
- **Batches**: tick routes individually or per network, then "Execute selected" creates a batch that runs the routes one after another (`/batch/[id]`); each route keeps its own resumable timeline (`/route/[id]`).
- **Staged search**: short paths first; when none quotes, multi-hop detours (first X, then Y, then the target) and bridge-after-bridge relays are tried; when a provider reports a hard cap (Across liquidity), the part it can take is routed as a `PARTIAL` plan.

## Selling and buying arbitrary test tokens

> Off by default. The product surface is native gas, ETH/WETH and Circle USDC. Enable **Settings › Unverified tokens (advanced)** to turn the features below on.

- **`/swap` page** (header → Swap): pick a chain, "You pay" (any asset with a live pool, balances and MAX presets) and "You receive" (USDC / native / WETH or a token by address); every live Uniswap route is quoted (direct pool or one transaction through WETH), the best output wins, and the card shows impact, minimum received and the pool path. Execute opens the same route page as the Router. Cross-chain moves stay in the Router.

- **Discovery**: on chains with a public Blockscout (Sepolia, Base, OP, Arbitrum, Unichain, World Chain, Arc, GIWA) the wallet's other ERC-20s are listed, then `decimals()` and `balanceOf` are re-read on-chain. Symbol and name are display data; identity is chain + contract.
- **Sell**: the Uniswap adapter probes token ↔ USDC and token ↔ WETH pools (liquidity + quote) and adds sell edges. An unverified token can only leave the wallet through a swap into a verified asset (never bridged as-is); the only spender approved is the Uniswap router, exact amount.
- **Buy**: add any token by address as the target ("Custom token…" on the router page). A buy route exists only if a live pool quotes USDC/native → token.
- **Only sellable tokens survive**: a discovered token is kept only if a live pool can sell it and a state-override transfer simulation (inject a balance, transfer it, read what arrived) shows no fee and no block. Everything else is dropped before it reaches the UI.
- **One transaction for two hops**: token → WETH → USDC (and USDC → WETH → token) is quoted with `quoteExactInput` and executed with a single `exactInput` path.
- **Price impact**: every swap quote carries its impact versus the marginal pool price; above the configured limit (default 5%) the planner routes a smaller amount as a `PARTIAL` plan instead of dumping into a thin pool.
- The swap is executed by your own wallet against the Uniswap router; there is no intermediary and no OTC. Testnet tokens have no defined value; selling them for real money is outside the scope of this project (and against most faucet terms).

## Coverage: which chains can be added

`/coverage` (and `pnpm coverage`) aggregates the public registries that publish chain support and contrasts them with this registry:

| Source | What it gives | Access |
|---|---|---|
| Circle CCTP supported chains (docs) | domains per testnet (30 entries, incl. Linea, Ink, Sonic, HyperEVM, Plume, Sei, …) | static directory in `packages/registry/src/coverage.ts`, chain ids cross-checked against chainid.network |
| `developers.uniswap.org/deployments.json` | v3/v4 contracts per chain (39 chains) | proxied by `/api/feeds/uniswap` (no CORS); also consumed by the swap adapter at runtime |
| `testnet.across.to/api/chains` | SpokePool + tokens per testnet | direct |
| `li.quest/v1/chains` | LI.FI chains incl. 5 testnets | direct |
| `metadata.layerzero-api.com/v1/metadata/deployments` | EIDs + endpoints (253 testnets) | direct |
| Hyperlane registry `chains/metadata.yaml` | 348 chains with `isTestnet` | direct |
| `chainid.network/chains.json` | name, native currency, RPCs, faucets, explorers | direct |

A feed entry is never trusted blindly: the Uniswap adapter resolves WETH9 from the router and probes pools on-chain (Monad Testnet is in the feed but its contracts have no bytecode, so no swap edge exists there).

## Supported networks (tier 1)

Ethereum Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Arc Testnet (USDC gas, 18/6 decimal normalisation), Monad Testnet (MON), Avalanche Fuji (AVAX), Polygon Amoy (POL), Unichain Sepolia, World Chain Sepolia, GIWA Sepolia (OP Stack; canonical deposit from Sepolia, Blockscout token discovery, no Circle/DEX deployment yet), and the Circle testnets Linea Sepolia, Ink Sepolia (OP Stack, canonical deposit), Sonic Testnet (S), Plume Testnet (PLUME), Sei Testnet (SEI), Cronos Testnet (TCRO), Plasma Testnet (XPL), X Layer Testnet (OKB) and Injective Testnet (INJ). Every chain id, USDC contract, TokenMessengerV2 bytecode, Multicall3 and wrapped-native contract was verified on-chain before being listed (`scripts/probe-chains.ts`).

New chains are added through registry data (`packages/registry/src/chains.ts`), not route-specific code.

## What is live

Verified on 2026-09-16 with `pnpm probe` and `pnpm discover`:

- Circle CCTP (current version) burn/attest/mint between all 19 Circle chains; fee tables from the Iris sandbox API; Fast Transfer where the source supports it. Every pair has two edges: a manual mint (you submit `receiveMessage`, destination gas required) and a **Forwarding Service** edge (`depositForBurnWithHook` with the forward hook: Circle submits the mint, its flat USDC fee is quoted with `?forward=true` and deducted from the burned amount, no destination gas). Forwarding is not offered where Circle does not run it as a destination (Cronos, Plasma, X Layer, Injective).
- Uniswap v3 native/WETH ↔ USDC on Ethereum Sepolia, Base Sepolia and the feed chains, only where a pool exists, has liquidity, and quotes. When the best single pool shows ≥ 0.30 % price impact, the input is split across the two deepest fee tiers in one `multicall` transaction if that returns more.
- Uniswap v4 hookless ETH/USDC pools on Ethereum Sepolia, Base Sepolia and Arbitrum Sepolia (StateView liquidity + V4Quoter probe), executed through the Universal Router; USDC input goes through Permit2 with an exact-amount, 30-minute allowance.
- Uniswap v2 pools on Ethereum Sepolia and Unichain Sepolia, plus v2-style AMMs on Avalanche Fuji (Pangolin, LFJ v1) so AVAX has a swap leg; constant-product price impact is exact.
- Hyperlane CCTP-backed USDC warp routes between Sepolia, Base, OP and Arbitrum Sepolia (three registry routes incl. CCTP v2 fast): the relayer mints on the destination, the interchain gas payment is quoted on-chain and reserved with gas as `msg.value`.
- Circle Gateway: deposit into the Gateway wallet, wait for finality, sign an EIP-712 burn intent, Circle's forwarder mints on the destination (no destination gas). Fees from `/v1/estimate` are deducted from the deposit; Ethereum Sepolia as source costs about 1 USDC, L2s and Arc cents.
- Stargate V2 native ETH between Sepolia, Arbitrum Sepolia and OP Sepolia, capped by the live path credit (surfaced as a PARTIAL route), delivery confirmed through LayerZero Scan.
- Issuer test tokens (Circle EURC, Chainlink LINK) are registry assets: scanned, sellable through live pools, never bridged as-is.
- Chain consolidation: balances on one chain that leave through the same hub asset are offered as one pooled bridge (legs first, then a single burn for whatever landed on the hub).
- LI.FI Intents testnet pairs from `/v1/tools`, quoted through `/v1/quote` and executed as returned; always best effort.

Execution safety: exact approvals only; every transaction simulated, gas-budgeted (with the OP Stack L1 data fee) and summarised before the wallet prompt; spender bytecode hashes pinned; the wallet nonce is snapshotted so a retry finds an already-sent burn on-chain (CCTP logs) or stops with POSSIBLE_DUPLICATE instead of burning again; wallet disconnects pause instead of failing; history is archived, never deleted, and unminted burns are listed from the chains themselves.
- Across testnet routes discovered from `/available-routes`, always flagged `BEST_EFFORT_TESTNET`; quotes come from `/suggested-fees` (liquidity on testnet is small).
- OP Standard Bridge L1 → L2 ETH deposits for OP Sepolia, Base Sepolia, GIWA Sepolia and Ink Sepolia.
- Native wrap/unwrap edges only where the wrapped contract was verified on-chain (no WMON, WPLUME or WXPL edge yet).

## Non-negotiable rules (spec §46)

Native is a role, not ETH · asset identity is chain + address + representation · Circle-native USDC stays distinguishable · current CCTP only · Arc decimals normalised · messaging ≠ token route · deployment ≠ liquidity · every executable route has a live quote · gas is reserved before conversion · simulate before signing · faucets are assistance, not edges · no keys on a server · provider support refreshed at runtime · wrapped output is visible and opt-in · "no route" is a correct answer · every route explains where its data came from.
