import Link from "next/link";
import { CHAINS } from "@testnet-router/registry";
import { Screens } from "@/components/screens";
import { Label, Module, PageTitle, Rule, Tag } from "@/components/ui";

export const metadata = { title: "How it works" };

const STEPS = [
  {
    n: "01",
    title: "Scan",
    body: "Balances are read from public RPCs in your browser for every registry chain: native gas, wrapped native and Circle USDC (plus the issuer test tokens and, when enabled, ERC-20s an indexer lists). Nothing is sent to a server.",
  },
  {
    n: "02",
    title: "Discover",
    body: "Every provider is asked what it can do right now: Uniswap pools with liquidity and a probe quote, CCTP domains with bytecode on both sides, Across and LI.FI route lists, Hyperlane and Gateway contracts verified on-chain. \"Protocol supports chain X\" is never enough for an edge.",
  },
  {
    n: "03",
    title: "Quote",
    body: "For each balance the planner walks the capability graph (shortest paths first), quotes every hop with the amount that actually arrives, reserves gas on every chain a step touches, and keeps the best route per mode. Provider caps and thin pools become PARTIAL routes instead of failures.",
  },
  {
    n: "04",
    title: "Simulate",
    body: "Before the wallet is asked to sign, each transaction is eth_call-simulated, gas is estimated on our RPC (plus the L2 data fee), the spender's bytecode hash is compared with the pinned one, and the exact calldata is summarised in plain words.",
  },
  {
    n: "05",
    title: "Sign and track",
    body: "Your wallet signs one transaction at a time. Cross-chain steps are polled (Circle attestations, relayers, LayerZero Scan). A burn is never sent twice: if the wallet's nonce moved, the transaction is found on-chain or the route stops and asks you.",
  },
];

/** What a route actually costs, in the order the costs appear. */
const COSTS = [
  ["Gas on the source chain", "Reserved before anything is converted: gas units × max fee per gas × a safety factor, plus any relayer fee the transaction carries as msg.value. A native balance is never routed down to zero."],
  ["Protocol fee", "CCTP charges a small USDC fee on fast transfers and a flat fee when Circle submits the destination mint. Circle Gateway charges a per-source fee plus one forwarding fee per transfer. Both are deducted from the amount, and both are shown on the card before you sign."],
  ["Price impact", "Only when a route swaps. Your own size moves the pool; the card shows the impact and, above your limit (Settings, 5% by default), the planner routes a smaller amount and marks the route PARTIAL instead of dumping into a thin pool."],
  ["Slippage tolerance", "The minimum output written into the swap transaction (1% by default). If the pool moves more than that between the quote and the signature, the transaction reverts before it can take your funds; Retry re-quotes at the new price."],
  ["Gas on the destination", "Only for routes that need you to submit the mint. The Forwarding Service, Gateway, Hyperlane, Across and LI.FI edges deliver without it, and the card says which kind you are looking at."],
];

/** The errors that actually show up, and what to do about each. */
const PROBLEMS = [
  ["WRONG_CHAIN", "The wallet is on another network. RouteDust asks it to switch (and adds the network first when the wallet does not know it); approve that prompt. If the wallet was rejected or closed, Retry."],
  ["NEEDS GAS", "The chain has no native balance for its own transactions. The card names the chain and links its faucets; top up and Retry."],
  ["SLIPPAGE_EXCEEDED", "The pool moved more than your tolerance between quote and signature. Retry re-quotes at the current price and rebuilds the step; raise the tolerance in Settings only if it keeps happening."],
  ["PARTIAL", "A provider cap or your price-impact limit made the full balance unroutable. The card shows the amount that fits and why. Route it in parts, pick a target that needs no swap, or raise the limit and accept the loss."],
  ["POSSIBLE_DUPLICATE", "A transaction left the wallet after a step was handed to it and could not be matched. Nothing is re-sent: paste that transaction's hash if it was this step, or mark it unrelated. Approvals resolve themselves from the allowance; burns always ask."],
  ["Burned but not minted", "Activity → Circle USDC burns on-chain → Scan reads the burns from every chain and mints the ones that never arrived, even if the route was archived. An expired fast attestation is renewed automatically."],
];

const PRINCIPLES = [
  ["Native is a role, not ETH", "MON, AVAX, POL, S, SEI, TCRO, XPL, OKB and INJ are gas assets in their own right; wrapped versions are separate assets."],
  ["Asset identity is chain + address + representation", "Circle-native USDC, a bridged USDC and a wrapped native are different nodes in the graph even when the symbol matches."],
  ["Deployment is not liquidity", "A DEX contract being deployed proves nothing; only a pool with liquidity and a successful probe quote becomes a swap edge."],
  ["Every executable route has a live quote", "Quotes expire; expired ones are re-quoted, never reused."],
  ["Gas is reserved before conversion", "Native balances keep enough for the route's own transactions, including destination claims and relayer fees."],
  ["\"No route\" is a correct answer", "When nothing is executable the app says so and explains what each provider replied."],
  ["Every route explains itself", "Each edge carries where its data came from (official registry, on-chain probe, runtime API) and when it was verified."],
];

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="How it works" meta={`Scan → Discover → Quote → Simulate → Sign · ${CHAINS.length} testnets · every step verifiable`} />

      <Module className="p-0">
        <svg viewBox="0 0 900 120" className="w-full" role="img" aria-label="Five-step flow">
          {STEPS.map((s, i) => {
            const x = 30 + i * 175;
            return (
              <g key={s.n}>
                <rect x={x} y={30} width={150} height={60} rx={4} className="fill-transparent stroke-current text-border" strokeWidth={1} />
                <text x={x + 12} y={55} className="fill-current text-muted" fontSize={11} fontFamily="ui-monospace, monospace">
                  {s.n}
                </text>
                <text x={x + 12} y={76} className="fill-current" fontSize={15} fontWeight={600}>
                  {s.title}
                </text>
                {i < STEPS.length - 1 ? (
                  <text x={x + 158} y={64} className="fill-current text-muted" fontSize={14} fontFamily="ui-monospace, monospace">
                    →
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </Module>

      <div className="grid-12">
        {STEPS.map((s) => (
          <Module key={s.n} className="col-span-4 flex flex-col gap-2 md:col-span-6">
            <div className="flex items-baseline gap-3">
              <span className="mono text-xs text-muted">{s.n}</span>
              <span className="display text-lg">{s.title}</span>
            </div>
            <p className="text-sm text-muted">{s.body}</p>
          </Module>
        ))}
      </div>

      <section id="screens" className="flex flex-col gap-4 scroll-mt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-lg">The app itself</h2>
          <span className="meta">captured from a watched wallet, nothing staged</span>
        </div>
        <Screens />
      </section>

      <Module className="flex flex-col gap-3">
        <Label>What a route costs</Label>
        <div className="flex flex-col">
          {COSTS.map(([title, body]) => (
            <div key={title} className="rule grid grid-cols-1 gap-1 py-3 md:grid-cols-[18rem_1fr] md:gap-6">
              <span className="text-sm">{title}</span>
              <span className="text-sm text-muted">{body}</span>
            </div>
          ))}
        </div>
      </Module>

      <Module className="flex flex-col gap-3">
        <Label>When something goes wrong</Label>
        <div className="flex flex-col">
          {PROBLEMS.map(([code, body]) => (
            <div key={code} className="rule grid grid-cols-1 gap-2 py-3 md:grid-cols-[18rem_1fr] md:gap-6">
              <span>
                <Tag tone="warn">{code}</Tag>
              </span>
              <span className="text-sm text-muted">{body}</span>
            </div>
          ))}
        </div>
      </Module>

      <Module className="flex flex-col gap-3">
        <Label>Non-negotiable rules</Label>
        <div className="flex flex-col">
          {PRINCIPLES.map(([title, body]) => (
            <div key={title} className="rule grid grid-cols-1 gap-1 py-3 md:grid-cols-[18rem_1fr] md:gap-6">
              <span className="text-sm">{title}</span>
              <span className="text-sm text-muted">{body}</span>
            </div>
          ))}
        </div>
        <Rule />
        <p className="text-sm text-muted">
          The full reference (concepts, adding a chain, writing an adapter, the security model, troubleshooting) is in <Link href="/docs" className="underline underline-offset-2">Docs</Link>.
        </p>
      </Module>
    </div>
  );
}
