import Link from "next/link";
import { CHAINS } from "@testnet-router/registry";
import { Label, Module, PageTitle } from "@/components/ui";

export const metadata = { title: "Docs" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Module className="flex flex-col gap-3" as="section">
      <h2 id={id} className="display scroll-mt-24 text-lg">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-muted [&_code]:mono [&_code]:text-sm [&_code]:text-text [&_li]:leading-relaxed [&_strong]:text-text">{children}</div>
    </Module>
  );
}

const TOC = [
  ["concepts", "Concepts"],
  ["providers", "Providers"],
  ["planner", "Planner and modes"],
  ["execution", "Execution and safety"],
  ["privacy", "Privacy and keys"],
  ["cli", "Command line"],
  ["chains", "Adding a chain"],
  ["adapters", "Writing an adapter"],
  ["troubleshooting", "Troubleshooting"],
];

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Docs" meta="Reference for RouteDust · registry-driven testnet router">
        <Link href="/how-it-works" className="btn">
          How it works →
        </Link>
      </PageTitle>

      <Module className="flex flex-wrap gap-x-5 gap-y-1">
        <Label>Contents</Label>
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="mono text-xs uppercase tracking-label text-muted hover:text-text">
            {label}
          </a>
        ))}
      </Module>

      <Section id="concepts" title="Concepts">
        <p>
          <strong>Native is a role.</strong> Every chain has a gas asset; on most of the {CHAINS.length} registry testnets it is ETH, on others MON, AVAX, POL, S, SEI, TCRO, XPL, OKB or INJ. On Arc Testnet the gas asset is USDC itself, with 18 decimals at the RPC level and a 6-decimal ERC-20 mirror; amounts are scaled at the boundary.
        </p>
        <p>
          <strong>Asset identity</strong> is <code>chain + address + representation</code>. Representations: <code>NATIVE</code>, <code>WRAPPED_NATIVE</code>, <code>CIRCLE_NATIVE</code> (Circle-issued USDC), <code>CANONICAL</code> (issuer test tokens such as EURC and LINK), <code>UNKNOWN</code> (wallet-discovered or user-added tokens, hidden unless enabled in Settings).
        </p>
        <p>
          <strong>Capability graph.</strong> Nodes are (chain, canonical asset, representation). Edges are what a provider can do right now, each carrying its provenance (official registry, on-chain probe or runtime API, with a timestamp), gas requirements, reliability class and output canonicality. Paths are searched with iterative deepening so a direct route is never hidden behind long detours.
        </p>
        <p>
          <strong>Unified balance vs. bridge.</strong> CCTP burns and mints move USDC one chain at a time. Circle Gateway deposits USDC into a per-chain vault and lets a signed burn intent mint it anywhere Circle forwards to; RouteDust uses it as one more edge, with the fee taken from the deposited amount.
        </p>
      </Section>

      <Section id="providers" title="Providers">
        <ul className="list-disc pl-5">
          <li>
            <strong>Circle CCTP</strong>: burn on the source, Iris attestation, mint on the destination. Two edges per pair: manual mint (you submit <code>receiveMessage</code>) and Forwarding Service (Circle mints, flat USDC fee deducted). Fast Transfer where the source supports it.
          </li>
          <li>
            <strong>Circle Gateway</strong>: deposit → finality → EIP-712 burn intent → Circle forwards the mint. Slow from Sepolia-family chains (about 15 minutes of finality) and expensive towards Ethereum Sepolia; cheap between L2s and Arc.
          </li>
          <li>
            <strong>Uniswap v3 / v4 / v2</strong> and v2-style AMMs (Pangolin, LFJ on Fuji): only pools with liquidity and a successful probe quote. v3 routes are single-hop, two-hop through WETH, or split across two fee tiers in one transaction. v4 goes through the Universal Router with exact Permit2 allowances.
          </li>
          <li>
            <strong>Hyperlane</strong> CCTP-backed USDC warp routes (Sepolia, Base, OP, Arbitrum Sepolia): relayer delivery, interchain gas paid as <code>msg.value</code> and reserved with gas.
          </li>
          <li>
            <strong>Stargate V2</strong> native ETH pools (Sepolia, Arbitrum Sepolia, OP Sepolia): capped by the path credit, delivery confirmed through LayerZero Scan.
          </li>
          <li>
            <strong>Across</strong> and <strong>LI.FI Intents</strong> testnet routes, always flagged best effort; <strong>OP Standard Bridge</strong> L1 → L2 ETH deposits; native wrap/unwrap where the wrapped contract was verified.
          </li>
        </ul>
        <p>
          Live status per provider is on <Link href="/protocols" className="underline underline-offset-2">Protocols</Link>; what each external registry claims versus what discovery found is on <Link href="/coverage" className="underline underline-offset-2">Coverage</Link>.
        </p>
      </Section>

      <Section id="planner" title="Planner and modes">
        <p>
          For every balance: reserve gas (units × max fee × safety, plus relayer fees) → enumerate structural paths → quote short paths, then detours, then relays → shrink to a provider cap or to the price-impact limit (PARTIAL) → score per mode. Modes: <strong>Best output</strong> (output-dominant), <strong>Fewest transactions</strong>, <strong>Fastest</strong>, <strong>Native only</strong> (no wrapped outputs), <strong>Max coverage</strong>. Changing the mode re-scores without re-quoting.
        </p>
        <p>
          <strong>Pooled bridges</strong> (chain consolidation): when several balances on one chain leave through the same hub asset, the same-chain legs run first and one bridge is quoted for the pooled amount: fewer signatures and one destination claim. The bridge leg executes in balance mode, capped at the plan amount.
        </p>
        <p>
          <strong>Gas needs</strong> are structured: when a shorter path was skipped because an intermediate or destination chain has no gas, the card shows the shortfall with that chain's faucets.
        </p>
      </Section>

      <Section id="execution" title="Execution and safety">
        <ul className="list-disc pl-5">
          <li>Approvals are exact amounts to spenders that come from the registry (router, TokenMessenger, Gateway wallet, position manager), never unlimited.</li>
          <li>Every transaction is simulated, gas-estimated (including the OP Stack L1 data fee) and checked against the native balance before the wallet prompt; the calldata is summarised on the timeline.</li>
          <li>Bytecode hashes of spenders are pinned (registry values plus first use in this browser); a change is reported before signing.</li>
          <li>The wallet nonce is snapshotted before each signature. On retry, if the nonce moved, the provider looks for the transaction on-chain (CCTP: DepositForBurn logs) and resumes from it; otherwise the route stops with POSSIBLE_DUPLICATE and you decide with the explorer open. A burn is never repeated.</li>
          <li>A wallet disconnect pauses the route (nothing failed on-chain); reconnect and resume. Sped-up or cancelled transactions are followed by hash.</li>
          <li>History is never deleted, only archived. Activity also reads the wallet's CCTP burns directly from every chain and lets you mint the unminted ones.</li>
        </ul>
      </Section>

      <Section id="privacy" title="Privacy and keys">
        <ul className="list-disc pl-5">
          <li>Signing happens in your wallet. The app holds no private key and no server of ours ever sees one.</li>
          <li>Balances, quotes and plans are read from public RPCs in your browser; the shared discovery endpoint (<code>/api/discovery</code>, five-minute cache) only answers “what can each provider do right now”, never anything about your address.</li>
          <li>History, settings and contract pins live in this browser (<code>localStorage</code>), never on a server. Routes are archived, never deleted.</li>
          <li>The LI.FI API key and the faucet key stay server-side; requests are proxied so the browser never receives them.</li>
          <li>
            <code>?watch=0x…</code> opens the app read-only on any address — useful for sharing a plan. A watched address can never sign.
          </li>
        </ul>
      </Section>

      <Section id="cli" title="Command line">
        <p>The same code runs outside the browser; these are the checks used before each release.</p>
        <ul className="list-disc pl-5">
          <li>
            <code>pnpm edges [provider…]</code> — live discovery plus one sample quote per edge. The fastest way to see whether an adapter still works.
          </li>
          <li>
            <code>pnpm e2e 0xWallet [preset]</code> — plan for a wallet and <code>eth_call</code> every transaction the best routes would send. No key needed.
          </li>
          <li>
            <code>pnpm live &lt;target&gt; &lt;source&gt; &lt;amount&gt;</code> — a real, signed run through the production executor with a local key; <code>--gateway</code> runs the pooled Circle Gateway set. Testnet funds only.
          </li>
          <li>
            <code>pnpm probe --write</code> — re-verifies the registry on-chain and stamps the verification date. <code>pnpm coverage</code> compares public registries with ours.
          </li>
        </ul>
      </Section>

      <Section id="chains" title="Adding a chain">
        <ol className="list-decimal pl-5">
          <li>
            Run <code>pnpm exec tsx scripts/probe-chains.ts</code> with the candidate in its list: it verifies the RPC chain id, Circle USDC, TokenMessengerV2 bytecode, Multicall3 and a WETH predeploy, and prints a registry seed.
          </li>
          <li>
            Add the chain id to <code>packages/registry/src/faucets.ts</code> (with its faucets), the chain to <code>chains.ts</code>, USDC to <code>assets.ts</code>, the CCTP domain (fast / forwarding flags) to <code>cctp.ts</code>, and mark the coverage entry verified.
          </li>
          <li>
            <code>pnpm probe --write</code> re-verifies everything and stamps the registry date; <code>pnpm edges</code> shows the live edges the chain gained. No route-specific code is needed: CCTP, Gateway and wrap edges come from the registry data.
          </li>
        </ol>
      </Section>

      <Section id="adapters" title="Writing an adapter">
        <p>
          A provider implements <code>RouteProvider</code>: <code>discover(ctx)</code> returns edges that were confirmed live (pool with liquidity + probe quote, API route list, verified bytecode), <code>quote(req)</code> returns a live quote or <code>null</code> (throw <code>QuoteLimitError</code> with the cap when the provider can take a smaller amount), <code>build(edge, ctx)</code> returns the steps for the actual input amount (approval, transaction, wait, permit), <code>status(exec)</code> polls a cross-chain step and may return a claim transaction or persist data into the step, and the optional <code>recover(step)</code> finds an already-sent transaction so retries never duplicate it.
        </p>
        <p>
          Rules: never emit an edge from “protocol supports chain X”; put non-user-specific data behind <code>TtlCache</code>; keep bigints out of <code>quote.raw</code> route objects; set <code>nativeFeeWei</code> when the source transaction carries a relayer fee; give every signed step a <code>summary</code>.
        </p>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <ul className="list-disc pl-5">
          <li>
            <strong>Wallet shows an RPC error on a testnet (Rabby, MetaMask)</strong>: the wallet's own endpoint is failing. Networks → “Add to wallet” registers the chain with the registry RPC; the executor also adds it automatically when the wallet does not know the chain.
          </li>
          <li>
            <strong>Need gas</strong>: the card names the chain and links its faucets; after topping up, Retry. Destination mints (manual CCTP) need gas on the destination; the Forwarding Service edge does not.
          </li>
          <li>
            <strong>Quote expired</strong>: cards re-quote themselves in the background; execution re-quotes before signing.
          </li>
          <li>
            <strong>POSSIBLE_DUPLICATE</strong>: a transaction left the wallet after a failed step. Paste its hash if it was this step, or mark it unrelated; nothing is sent until you choose.
          </li>
          <li>
            <strong>Burned but not minted</strong>: Activity → “Circle USDC burns on-chain” → Scan; unminted burns can be minted from there even if the route was archived. A Fast Transfer attestation expires after about a day, and RouteDust asks Circle to re-attest it automatically.
          </li>
          <li>
            <strong>SLIPPAGE_EXCEEDED</strong>: the pool moved more than the tolerance between the quote and the signature, so the transaction reverted before spending anything. Retry re-quotes and rebuilds the step at the current price; the tolerance itself is in Settings.
          </li>
          <li>
            <strong>Only part of a balance is routable (PARTIAL)</strong>: routing the rest would move the pool past your price-impact limit. Choose a target that needs no swap (USDC to USDC only bridges), route it in parts, or raise the limit in Settings and accept the loss.
          </li>
          <li>
            <strong>WRONG_CHAIN</strong>: approve the network switch in the wallet. RouteDust reads the chain from the wallet itself and adds the network first when the wallet does not know it.
          </li>
          <li>
            <strong>Gateway deposit stays “waiting for finality”</strong>: Circle credits a deposit only after the source chain finalises (seconds on Arc, Fuji, Amoy, Sei and Sonic; about 15 minutes on Sepolia and its L2s). Until the burn intent is signed, the USDC sits in your own Gateway balance and can be withdrawn.
          </li>
        </ul>
      </Section>
    </div>
  );
}
