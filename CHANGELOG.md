# Changelog

Registry changes matter more than code here: every chain, contract, fee assumption and verification date is listed so a stale entry can be traced.

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
