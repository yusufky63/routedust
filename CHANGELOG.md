# Changelog

Registry changes matter more than code here: every chain, contract, fee assumption and verification date is listed so a stale entry can be traced.

## 2026-09-30 (no scanning loop across tabs, Bridges / Faucets in the header)

### Changed
- The header has its own "Bridges / Faucets" entry (active on both pages, like "Swap / Bridge"); the Network menu keeps Networks, Protocols, Coverage, Liquidity and the new Status page. The page switch under the title now reads Bridges | Faucets. Nav entries live in one place (`components/nav.ts`) for the header, the bottom bar and its menu.
- Phones and tablets (below 1024 px) use the bottom bar, whose "More" opens a menu with every page the bar has no room for (Bridges, Faucets, the Network pages, Settings, How it works, Docs); Settings used to be reachable only from the footer there. From 1024 px the header nav fits on one row (it wrapped to two between 768 and ~900 px).
- Footer: a "Bridges / Faucets" column; Liquidity and Status sit under Network.
- Status page (`/status`, and `/api/health` as JSON): whether each testnet's RPC and the Circle attestation, Circle Gateway, LI.FI, Across and Hyperlane explorer APIs answer right now, checked at most once a minute.
- Every page has its own title, description and canonical link; `robots.txt`, `sitemap.xml`, a web manifest, an Apple touch icon and `llms.txt` are served. Route and batch pages (one browser's own runs) are not indexed.
- Docs: a "Where things are" section (every page in plain words), watching an address, and what tabs share (history, settings) and what each keeps (wallet or watched address, balances). How it works: "Help from outside" (faucets, network bridges).

### Fixed
- Balances (and every page that scans) no longer loops in "Scanning…" after connecting a wallet while another tab watches a different address. Each tab reloaded the other's saved state, took its scan for the other address and rescanned its own, forever. Once loaded, a tab keeps its own scan, discovered tokens and watched address; it only takes a newer scan of the same wallet from another tab.
- A scan that is overtaken by a newer one (the wallet connected or the address changed while it ran) no longer overwrites the new address's scan or clears its "Scanning…" state.
- `?watch=0x…` is applied once per page load: "Stop watching" and "Watch another address" are no longer undone while the parameter stays in the URL.

## 2026-09-29 (fixes from the project report)

Every finding of the 2026-09-29 report's "Hatalar ve riskler" section, in order of severity.

### Fixed — high
- A route can no longer run twice. Running executions live in a module-level registry (not in the page), and each run holds a Web Lock named after the execution, so leaving the route page and pressing Resume, or opening the route in a second tab, cannot start a second executor while a wallet prompt is still open. Pages show "running in another tab" and disable Resume.
- `/api/logo` can no longer serve script: responses carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, the GitHub prefixes are pinned to the `main` / `master` refs (fork commits under the parent path are refused), only image extensions are served and redirects are refused.
- Tabs no longer erase each other's history. Executions, batches and rollup withdrawals moved from the single persisted blob to one localStorage key each (persist v4 migrates them) and sync across tabs through the `storage` event. A full storage quota no longer throws during signing: finished routes are compacted (log tail, no provider payloads) and a warning is logged.

### Fixed — medium
- Retry after an on-chain revert: the step is marked `TX_REVERTED`, its hash kept under `revertedTxHashes`, its nonce cleared, and Retry rebuilds it at the current price instead of re-sending the failed calldata.
- A CCTP manual mint that never reached the chain (rejected, no destination gas, expired Fast Transfer attestation) is rebuilt on retry from a fresh status poll, which also re-requests the attestation.
- Re-quotes during execution use the slippage from Settings (was a fixed 1 %) and must stay above the minimum accepted at planning time, scaled to the actual input; otherwise the route stops with `QUOTE_MOVED` and the route page offers "Accept the new price and continue".
- `?refresh=1` on `/api/discovery` and `/api/coverage` is honoured at most once a minute and never starts a second run while one is in flight; coverage serves the last good report when a refresh fails.
- One slow RPC no longer drops a provider's edges on every chain: Uniswap v2/v3/v4 discover and resolve each chain in parallel with its own 25 s budget. 8 of the 11 single-RPC chains got a second endpoint, checked for chain id and a fresh head block (Arc, Monad, Unichain, World Chain, Ink, Plume, Cronos, Plasma); GIWA, Sonic and Sei have none that answers.
- Gas faucet: the per-chain lock has an owner token (compare-and-delete) and outlives a send; the nonce is the higher of the RPC's pending nonce and a KV counter; the transaction is signed locally so its hash is known before broadcast, and an ambiguous send keeps the claim reserved. Outside Vercel the client IP comes from `FAUCET_TRUSTED_PROXY_HOPS` entries from the right of x-forwarded-for.
- Spenders no longer come from API responses: Across deposits and approvals go to the registry's SpokePools (`ACROSS_TESTNET.spokePools`, from docs.across.to, `wrappedNativeToken()` checked on-chain, code hashes pinned) and the API has to agree; LI.FI quotes must match the request (chain, amount, sender, recipient) and for ERC-20s approve the contract they call.
- Swap's MAX keeps the gas of the chosen route for a native sale (shared `useGasReserve` with Bridge) and blocks an amount that leaves too little.

### Fixed after an independent review of the above
- The price check no longer stops routes it should let through: only the part of the planned output that depends on the amount is scaled (a flat bridge fee, e.g. CCTP forwarding, Across, a Gateway set, does not shrink when the swap before it delivered a little less), and the Settings slippage is allowed on top (`priceFloor`, tested). An accepted price covers one re-quote and never carries over to a later attempt.
- A full browser storage can no longer lead to a second signature: when a route's latest snapshot could not be saved, the executor asks nothing of the wallet and stops with "storage unavailable". Records storage refused to take stay in the persisted blob until they can be written, and the v4 migration never replaces a newer copy.
- A route update from another tab no longer writes this tab's older settings and code pins over the other tab's: the blob is re-read first.
- The gas faucet's nonce counter advances only once the node has the transaction and is trusted for two minutes, so an unanswered send cannot leave a nonce gap that blocks the faucet.
- One discovery budget per provider covers all its phases, so two slow phases cannot add up past the provider's 40 s limit.
- CCTP recovery also accepts a single matching burn sent at a later nonce than the snapshot (the wallet had another transaction pending), instead of stopping as a possible duplicate.
- A double click on "Sign & start" no longer reports "running in another tab", and a batch skips a route running elsewhere instead of stopping.
- Docs and How it works describe the Bridge tab, the compact Router, the network's own bridges and the new protections in plain words.

### Fixed — low
- The LI.FI proxy forwards exactly one allowed endpoint segment (`/api/lifi/quote/x` is refused).
- Gateway: the transfer POST retries 429/5xx; a 4xx that says the intent was already submitted is reported as such; the build fails cleanly instead of assuming a zero Gateway balance when the balance API is down.
- CCTP `recover` also matches `mintRecipient` and, when known, the wallet nonce of the step, so two equal burns in a batch cannot be swapped.
- The duplicate resolver checks a pasted hash on-chain: it must come from the connected wallet and call the step's contract.
- Liquidity mints send real minimums: the amounts the mint takes at the pool price (TickMath / LiquidityAmounts ported to `core/dex/ticks.ts`, tested against TickMath's anchors) less the Settings slippage. A pool someone else initialised first at another price now makes the mint revert instead of filling at their price.
- Settings saves an RPC override only after it answers with the right chain id; Protocols lists only what is really planned; README and the old REPORT no longer claim "no backend" / "no OP withdrawals".
- Tech debt: one `feePerGas` in core (the executor warns instead of silently skipping the gas check when a chain returns no price), one `mapLimit`, one Uniswap feed cache, CCTP discovery checks that TokenMessengerV2 has code, the executor works on `structuredClone` copies, dead code removed, `useRouteAmounts` returns a stable object.
- Bridge hides quoted routes returning less than half of the best one (LI.FI's testnet solver returned 0.50 USDC for 2 USDC) and says how many; Across routes say that an unfilled testnet deposit is not refunded (Across docs).

## 2026-09-29 (Swap → Bridge, each network's own bridge, a compact Router)

### Added
- Router: "Compact / Detailed" switch next to the filters (remembered in Settings). Compact shows one row per route (what leaves, who carries it, what arrives, time and transactions, Execute), pooled bridges as rows, and the balances that need gas or have no route as one line each with the one link that helps (faucet or the network's own bridge). Amount presets, alternatives and "Why this route?" stay in Detailed.
- Swap → Bridge (`/swap/bridge`): send one asset, all of it or any part, from one testnet to another. Pick the source chain and asset, an amount (25 / 50 / 75 %, MAX, or your own number) and the destination chain and asset. Every live path between them (a bridge, a swap then a bridge, a bridge then a swap) is quoted, scored with the route mode from Settings and listed; the best one is preselected and any other is one click away. For the gas token, MAX keeps back the fee of the chosen route. The chain pickers say which destinations have a live route (`CapabilityGraph.reachable`, a breadth-first pass over node × swaps × bridges). Executions remember they came from Bridge, so the route page leads back there.
- `OFFICIAL_BRIDGES` (registry): each network's own bridge UI, or the one its docs send testnet users to, with a link that preselects the direction where the bridge's own links show the format. Shown on Bridge (highlighted when no live route exists), on the Router's no-route rows and as "Own bridge" on Networks. Entries: Superbridge's testnet site for Base, OP, Unichain and Ink Sepolia (`testnets.superbridge.app/?fromChainId=&toChainId=`; the `superbridge.app` links in Base's and Unichain's docs open mainnet, and Brid.gg's testnet links no longer preselect anything), Arbitrum's bridge (`portal.arbitrum.io/bridge?sourceChain=&destinationChain=`) for Arbitrum Sepolia and, as Plume's docs say, Plume Testnet, Alchemy's World Chain Sepolia bridge, GIWA's (a Superbridge white-label, `?fromChainId=&toChainId=`), Linea's native bridge (the only one that works on testnet), Polygon Portal (Amoy, testnet switch in the app) and Injective's testnet bridge (linked from its testnet Hub). Each deep-link format was checked in a browser. No testnet bridge UI exists for Arc, Monad, Avalanche Fuji, Sonic, Sei, Cronos, Plasma or X Layer (OKX closed the X Layer bridge site on 2025-08-15); they are left out rather than guessed.
- OP Standard Bridge deposits from Ethereum Sepolia to Unichain Sepolia (`0xea58fcA6…4Ce2`) and World Chain Sepolia (`0xd7DF54b3…F8DE`): addresses from the superchain-registry, World Chain's docs and viem; bytecode, `version()` 2.8.2, `paused() == false` and a `bridgeETHTo` eth_call checked on Sepolia; code hashes pinned. Both chains now also get the OP Stack L1 data fee in the gas check.

### Changed
- Uniswap v3 pools in the 0.01 % tier are found now (`UNISWAP_V3_FEE_TIERS` = 100/500/3000/10000, one list for the registry and the feed deployments). On-chain check 2026-09-29: that tier holds live liquidity for WETH/USDC on Sepolia, Base Sepolia and Unichain Sepolia, EURC/WETH and LINK/WETH on Sepolia, and the only deep LINK/USDC pool on Base Sepolia (its 0.05 % and 0.3 % pools are empty, so LINK was sold through a thin 1 % pool). 20 of the 36 v3 edges now include a 0.01 % pool; a 0.002 ETH → USDC swap on Base Sepolia quotes through it and passes eth_call. Liquidity offers the tier too, only where the factory has it enabled (`feeAmountTickSpacing > 0`).
- Coming back to the Router no longer rescans or re-plans: the plan, amount overrides, search, filters and selection are kept while you move between pages, and a scan or plan that is still running keeps its progress. A new scan happens when the address changes, on Rescan, or once when the app loads with a scan older than five minutes.
- CCTP steps say who mints: "Circle mints" (forwarded) or "you mint" (claim on the destination), so the two CCTP routes of a pair no longer look identical.
- The GIWA exit links straight to the withdrawal direction (`?fromChainId=91342&toChainId=11155111`).

## 2026-09-18 (rollup withdrawals)

### Added
- Activity → "Rollup withdrawals": leaving an OP Stack testnet for Ethereum Sepolia now happens in the app. Start it on the rollup, and the panel reports what the portal says (waiting for a dispute game, ready to prove, in the challenge period, ready to finalise) with a countdown, then signs the two Sepolia transactions when they are due. A withdrawal started in another bridge can be tracked by pasting its L2 transaction hash.
- Six rollups are covered (GIWA, Base, OP, Ink, Unichain, World Chain Sepolia); the portal and dispute-game addresses come from viem's chain definitions, so nothing is hardcoded.
- The wait deliberately stays out of the route executor: quotes expire in minutes, a withdrawal takes about a week, so it is tracked as state (`withdrawals` in the store) instead of a route.
- `pnpm exec tsx scripts/withdraw.ts <chainId> <amount> | status | prove | finalize` for the same flow from the CLI.

### Verified live
- Bridged 0.01 ETH Sepolia → GIWA with the production executor, then started a real 0.002 ETH withdrawal on GIWA (`0x727f9ab2…`). The portal reported `waiting-to-prove` (~25 min), then `ready-to-prove`; the proof was signed on Ethereum Sepolia (`0x3834fc60…`, success) and the status moved to `waiting-to-finalize` with ~7 days left. The panel showed each stage with its countdown. Finalising can only be tested once that period is over.

## 2026-09-18 (faucet cards, and a way off GIWA)

### Changed
- Faucets: the multi-chain faucets are listed inside each network's card, tagged as such, instead of an "also via" line plus a separate section at the bottom.

### Added
- `CHAIN_EXITS` (registry): for a network nothing can route out of, the card now links the network's own bridge and says what the withdrawal involves. GIWA Sepolia is the first entry (sepolia-bridge.giwa.io; start on GIWA, prove on Sepolia after up to two hours, finalise after about seven days — from docs.giwa.io). Docs mention it under troubleshooting.

## 2026-09-18 (no screenshots in the app)

### Removed
- The screenshot gallery and the captures themselves (landing page and `apps/web/public/screens`). The pages speak for themselves; `?watch=0x…` stays as the way to show someone a real plan.

## 2026-09-18 (watching another address)

### Changed
- While watching without a wallet, the address can be swapped from the page itself: "Watch another address" opens the field inline on Router and Balances (and on Swap), next to "Stop watching". Previously you had to stop watching first and start over from the landing page.
- Balances without a wallet now offers both ways in: connect, or watch any address, instead of only telling you to connect.

## 2026-09-18 (docs for people who use the app)

### Changed
- Docs is written for users now: what the words mean, where routes come from, how a route is chosen, what protects you, what to do when one stops. The developer sections (privacy/keys, command line, adding a chain, writing an adapter) are gone; the repository covers those.
- How it works dropped the screenshots and the developer wording: the five steps, what a route costs and what to do when something goes wrong are all in plain language, with no error codes as headings.
- The screenshots stay on the landing page (Router, Balances, Swap); the unused captures were removed.

## 2026-09-18 (retry and STF diagnosis)

### Fixed
- Retry after a failed simulation now rebuilds the hop from a fresh quote (previously only slippage and expired quotes did, so a simulation failure kept replaying the stale transaction and the route had to be planned again from scratch).
- Before the first hop is built, the executor checks that the wallet still holds the planned input. A plan made on an older scan used to reach the router and revert with an opaque `STF`.
- An `STF` / "transfer amount exceeds balance" revert is now diagnosed on-chain and named: `INSUFFICIENT_BALANCE` (balance moved since planning: rescan) or `APPROVAL_MISSING` (allowance no longer covers the step: retry approves again). Both carry the numbers and a next step on the route page.

## 2026-09-18 (action bar)

### Changed
- Route and batch pages end with an action bar, directly above the log: the state in words on the left ("2 transactions to sign, one at a time", "Running · 1 of 3 steps done", "Done · 12.498 USDC on Base Sepolia") and the decision on the right, as large buttons. "Sign & start" names the number of transactions, stays visible (disabled) without a wallet, and Cancel sits next to it while a route runs.
- A finished route or batch offers "← Back to Router" (or Swap, following where it was started), plus its batch and Activity. The page header keeps only the status and quiet links.

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
