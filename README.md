# Testnet Router

Multi-chain **testnet asset router and dust consolidator**. Scans a wallet across EVM testnets, discovers live swap and bridge capabilities at runtime, reserves source gas, quotes and simulates every path, and consolidates routable balances into the exact chain and asset you choose.

The product definition (from the spec) that everything here serves:

> Given a wallet with fragmented balances across testnets, determine what is actually routable right now, preserve enough gas to execute, convert local native/ERC-20 dust into useful exit assets, choose among canonical and alternative cross-chain paths, and consolidate the result into the exact chain and asset the user wants.

## Status

MVP phases 0–2 of the spec are implemented and verified live against the networks (see "What is live" below). Phase 3 (multi-source local consolidation into one bridge, Max Coverage tuning) and phase 4 coverage providers (Gateway, LI.FI, LayerZero/Stargate, Wormhole, Hyperlane) are next.

## Layout

```
apps/web                Next.js 16 App Router UI (Modular Typography design system)
packages/core           types, capability multigraph, gas reserve, scoring, scanner, planner, execution engine
packages/registry       chains, assets, faucets, CCTP domains/contracts, DEX + bridge deployments, provenance
packages/providers      route adapters: circle-cctp, uniswap (v3), wrap, across, op-standard-bridge
scripts/probe.ts        on-chain capability probe (RPC chain ids, Multicall3, CCTP, Uniswap pools)
scripts/discover.ts     live discovery + optional wallet scan & plan from the CLI
```

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

Ethereum Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Arc Testnet (USDC gas, 18/6 decimal normalisation), Monad Testnet (MON), Avalanche Fuji (AVAX), Polygon Amoy (POL), Unichain Sepolia, World Chain Sepolia.

New chains are added through registry data (`packages/registry/src/chains.ts`), not route-specific code.

## What is live

Verified on 2026-09-16 with `pnpm probe` and `pnpm discover`:

- Circle CCTP (current version) burn/attest/mint between all 10 chains; fee tables from the Iris sandbox API; Fast Transfer where the source supports it.
- Uniswap v3 native/WETH ↔ USDC on Ethereum Sepolia and Base Sepolia, only where a pool exists, has liquidity, and quotes.
- Across testnet routes discovered from `/available-routes`, always flagged `BEST_EFFORT_TESTNET`; quotes come from `/suggested-fees` (liquidity on testnet is small).
- OP Standard Bridge L1 → L2 ETH deposits for OP Sepolia and Base Sepolia.
- Native wrap/unwrap edges only where the wrapped contract was verified on-chain (no WMON edge yet).

## Non-negotiable rules (spec §46)

Native is a role, not ETH · asset identity is chain + address + representation · Circle-native USDC stays distinguishable · current CCTP only · Arc decimals normalised · messaging ≠ token route · deployment ≠ liquidity · every executable route has a live quote · gas is reserved before conversion · simulate before signing · faucets are assistance, not edges · no keys on a server · provider support refreshed at runtime · wrapped output is visible and opt-in · "no route" is a correct answer · every route explains where its data came from.
