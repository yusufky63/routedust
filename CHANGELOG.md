# Changelog

Registry changes matter more than code here: every chain, contract, fee assumption and verification date is listed so a stale entry can be traced.

## 2026-09-18 (screenshots, docs, retry fixes)

### Added
- Screenshot section: real captures of Router, Balances, Swap, Protocols and Coverage (1440×900, dark) on the landing page and in full under How it works → "The app itself" (`apps/web/public/screens`, regenerate with headless Chrome against `?watch=`).
- `?watch=0x…` opens any page read-only on that address: shareable plans, and how the screenshots are taken.
- How it works: "What a route costs" (gas reserve, protocol fee, price impact, slippage, destination gas) and "When something goes wrong" (WRONG_CHAIN, needs gas, SLIPPAGE_EXCEEDED, PARTIAL, POSSIBLE_DUPLICATE, burned-but-not-minted).
- Docs: "Privacy and keys" and "Command line" sections; troubleshooting entries for slippage, PARTIAL amounts, chain switching and Gateway finality.

### Fixed
- A retry after a slippage failure or an expired quote now re-quotes and rebuilds the remaining steps of that hop instead of re-running the stale ones; steps already on-chain are kept. "Retry re-quotes at the current price" is finally true.
- Balances shows the watched address instead of asking to connect a wallet.

## 2026-09-18 (wallet fixes from the first browser run)

### Fixed
- Automatic network switching: the signer now reads the chain from the wallet itself (`eth_chainId` on the connector) instead of wagmi's config state, waits until the wallet confirms the switch, and re-checks immediately before signing. A wallet sitting on Ethereum mainnet used to be reported as "already on Sepolia", so no switch happened and viem rejected the transaction with a chain mismatch.
- A chain mismatch is now classified as `WRONG_CHAIN` instead of `UNKNOWN`.
- Retrying an approval whose wallet nonce moved no longer stops with `POSSIBLE_DUPLICATE`: the allowance is read on-chain, and the step either completes (allowance already in place) or is approved again, because approvals are idempotent. Burns keep the full duplicate protection.

## 2026-09-18 (first real signed runs)

### Verified on-chain with a funded testnet wallet (`pnpm live`, production executor)
- Sepolia ETH → Base USDC: Uniswap v3 swap + CCTP fast burn with the forwarding hook; Circle minted on Base, no destination gas. COMPLETED.
- Base USDC → Sepolia USDC: CCTP fast burn + manual `receiveMessage` claim on the destination. COMPLETED.
- Circle Gateway pooled set: deposits on Sepolia and Arc, then ONE `BurnIntentSet` signature for both chains and one forwarded mint on Base (19.205662 USDC). COMPLETED. The app still hides this option here, because two separate CCTP routes delivered more (the set's fee was 1.10 USDC); `--force` runs it anyway for testing.

### Fixed
- Executor: a confirmed approval is now waited for on the RPC before the next step, and an allowance-shaped simulation revert immediately after our own approval is retried once. Load-balanced public RPCs answered `eth_call` from a node that had not seen the approval yet, which failed a live Base → Sepolia burn with `SIMULATION_FAILED` although nothing was wrong.

### Added
- `pnpm live <target> <source> <amount>` — real, signed end-to-end runs through the production executor (local key from `FAUCET_PRIVATE_KEY`, `--cap` guard, `--gateway` for the pooled Circle Gateway set, `--force` to ignore the comparison).

## 2026-09-17 (faucet)

### Behaviour
- RouteDust gas faucet on /faucets for Sepolia, Base Sepolia, OP Sepolia, Arc and GIWA (native gas; amounts and chains configurable without code via `FAUCET_AMOUNTS`). Cloudflare Turnstile captcha, one claim per address and per IP per chain per 24 h, recipients that already hold a drip are refused, per-chain daily cap, claims rolled back when sending fails. Off until `FAUCET_PRIVATE_KEY`, Turnstile keys and a Redis store are configured. Official faucets stay listed below it.
- Activity lists batches and routes as tables. Route pages get a back button (to Swap or Router, and to the batch); batch pages link back to the Router.
- Footer: removed the "registry verified · no server-side keys · no market value" line.

## 2026-09-17 (protocol review)

### Behaviour
- Circle Gateway pooled transfer: USDC on two or more Gateway chains is deposited per chain, then one EIP-712 `BurnIntentSet` signature spends all deposits and Circle mints once on the target. The forwarding fee is paid once instead of per chain; offered when it delivers within 2 % of the separate routes or carries balances that have no route alone. Verified live: `/v1/estimate` accepts sets with the forwarder, `/v1/transfer` accepts the adapter's signatures (single and set) and rejects a wrong signer.
- Gateway burn intents are re-estimated when deposit finality is reached (the fee used to be up to ~20 minutes old when signed); a rejected intent now fails the step with Circle's message instead of polling forever.
- CCTP: expired Fast Transfer attestations are re-attested automatically (`POST /v2/reattest/{nonce}`), so an old unminted burn in Activity can still be claimed.
- Hyperlane: delivery and destination transaction come from the explorer index; balance polling stays as the fallback.
- LI.FI: fee-less fallback on code 1011, integrator from `LIFI_INTEGRATOR`, Arc native USDC legs no longer emitted.

### Reviewed and not added
- Uniswap v4 `PERMIT2_PERMIT` (same number of wallet prompts, needs calldata patched after signing), Stargate beyond the three ETH pools (mock tokens), LayerZero Value Transfer / OFT APIs (mainnet only), Hyperlane ETH routes (synthetic output, ~0.0003 ETH collateral), Uniswap Trading API (key, three testnets already read on-chain), Uniswap v3 on Monad testnet (SDK addresses have no bytecode).

## 2026-09-17

### Registry
- Added Circle testnets: Linea Sepolia (59141), Ink Sepolia (763373, OP Stack + L1StandardBridge), Sonic Testnet (14601), Plume Testnet (98867), Sei Testnet (1328), Cronos Testnet (338), Plasma Testnet (9746), X Layer Testnet (1952), Injective Testnet (1439). USDC, TokenMessengerV2 bytecode, Multicall3 and wrapped natives verified on-chain (`scripts/probe-chains.ts`).
- `CCTP_DOMAINS[].forwarding` flags where Circle's Forwarding Service can mint (not Cronos, Plasma, X Layer, Injective).
- Uniswap: feed now consumed for v2 (factory/router), v4 (PoolManager, V4Quoter, StateView), Universal Router and Permit2; `V2_AMM_DEPLOYMENTS` for Pangolin (two deployments) and LFJ v1 on Fuji.
- Hyperlane CCTP-backed USDC warp routes (`HYPERLANE_WARP_ROUTES`), verified with `routers(domain)` / `wrappedToken()`.
- Circle Gateway testnet (`CIRCLE_GATEWAY_TESTNET`): wallet `0x0077…19B9`, minter `0x0022…475B`, 11 registry chains.
- Stargate V2 native ETH pools on Sepolia, Arbitrum Sepolia, OP Sepolia (`STARGATE_NATIVE_POOLS`).
- Known test tokens (`KNOWN_TEST_TOKENS`): Circle EURC and Chainlink LINK where verified on-chain.
- `KNOWN_CODE_HASHES`: keccak256 of every spender / router / bridge bytecode (`scripts/codehash.ts`).
- dRPC endpoints removed (Cronos, World Chain).

### Behaviour
- Executor never re-sends a step whose wallet nonce moved: CCTP burns are recovered from logs, otherwise the route stops with POSSIBLE_DUPLICATE.
- Activity keeps history (archive instead of delete) and lists on-chain CCTP burns with Circle's status.

## 2026-09-16

- Initial registry: Ethereum Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Arc Testnet, Monad Testnet, Avalanche Fuji, Polygon Amoy, Unichain Sepolia, World Chain Sepolia, GIWA Sepolia; Circle CCTP V2 contracts; Uniswap v3 on Sepolia and Base Sepolia; Across testnet; OP Standard Bridges.

## 2026-09-17 (later)

- Product renamed to **RouteDust** (routedust.xyz); GitHub repository `yusufky63/routedust`; Vercel project `routedust`.
- LI.FI API key and integrator fee kept server-side (`/api/lifi` proxy); recipient address for routes and swaps; swap page redesign; footer; single mobile header with a bottom bar.
