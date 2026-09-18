import Link from "next/link";
import { CHAINS } from "@testnet-router/registry";
import { Label, Module, PageTitle, Rule } from "@/components/ui";

export const metadata = { title: "How it works" };

const STEPS = [
  {
    n: "01",
    title: "Scan",
    body: "Your balances are read straight from each network in your browser: the gas asset, the wrapped version and USDC. Nothing about your address is sent to a server.",
  },
  {
    n: "02",
    title: "Discover",
    body: "Every bridge and exchange is asked what it can do at this moment. A pool has to hold liquidity and answer a test quote, a bridge has to be live on both sides. Being deployed is not enough.",
  },
  {
    n: "03",
    title: "Quote",
    body: "Each balance gets a real price for every step, using the amount that actually arrives at that step. Enough gas is held back on every network the route touches, and short routes are preferred over detours.",
  },
  {
    n: "04",
    title: "Simulate",
    body: "Every transaction is run against the network first, so one that would fail is never put in front of you. The cost is checked against your balance, the contract is compared with the one seen before, and the wallet prompt is explained in plain words.",
  },
  {
    n: "05",
    title: "Sign and track",
    body: "You sign one transaction at a time and the page follows it to the other side. If something is interrupted, the route resumes where it stopped: a bridge transfer is never sent twice.",
  },
];

/** What a route actually costs, in the order you meet the costs. */
const COSTS = [
  ["Gas on the network you start from", "Held back before anything is converted, with a margin, so the route can pay for its own transactions. A gas balance is never routed down to zero."],
  ["The provider's fee", "Bridges take a small fee, usually in USDC, and a little more when they deliver the last step for you instead of asking you to sign it. It is taken out of the amount and shown on the card before you sign."],
  ["Price impact", "Only when a route converts one asset into another. Large amounts move the pool price against you. The card shows how much, and above your limit the route is offered for a smaller amount instead."],
  ["Slippage", "The worst price you accept, written into the transaction itself (1% by default). If the pool moves further than that while you are signing, the transaction is refused instead of filling at a bad price."],
  ["Gas where you receive", "Only for routes where you submit the final step yourself. Most bridges here deliver without it, and the card tells you which kind you are looking at."],
];

/** The things that actually stop a route, and what to do about each. */
const PROBLEMS = [
  ["Wallet on another network", "Approve the switch your wallet asks for. If it does not know the testnet yet, RouteDust adds it first with a working endpoint."],
  ["Not enough gas", "The network has none of its own gas asset. The card names it and links its faucets: top up, then press Retry."],
  ["The price moved", "The pool moved further than your slippage while you were signing, so the transaction was refused and nothing was spent. Retry prices it again."],
  ["Only part of the balance", "Converting the rest would move the pool past your limit. Route it in parts, pick a target that needs no conversion, or raise the limit in Settings."],
  ["Balance changed since planning", "The route was planned for more than the wallet holds now. Rescan on the Router page and plan again."],
  ["A transaction may already be out", "If something left your wallet after a step was handed to it, RouteDust stops and asks instead of sending again. Paste that transaction if it was this step, or mark it unrelated."],
  ["Sent but not arrived", "Activity finds USDC transfers that were started but never finished on the other side, and lets you complete them, even from an old route."],
];

const PRINCIPLES = [
  ["Gas is never the last thing you think about", "Every network keeps enough of its own gas asset for the transactions the route needs there, including the one that finishes the transfer on the other side."],
  ["A quote is a real price, not an estimate", "Prices are taken from the pools and bridges themselves and they expire. An old quote is never signed: it is fetched again first."],
  ["Same symbol does not mean same token", "USDC issued by Circle, a bridged copy of it and a wrapped gas token are different things, even where the name looks identical. Routes keep them apart."],
  ["Gas assets are not all ETH", "MON, AVAX, POL, SEI, INJ and the others are the real gas asset of their network, and they are treated as such."],
  ["\u201cNo route\u201d is an honest answer", "When nothing can be executed right now, the app says so and shows what each provider replied, instead of inventing a path."],
  ["Every route shows its sources", "Each step says where its data came from and when it was last verified, under \u201cWhy this route?\u201d."],
];

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="How it works" meta={`Scan → Discover → Quote → Simulate → Sign · ${CHAINS.length} testnets · you sign every transaction yourself`} />

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
          {PROBLEMS.map(([title, body]) => (
            <div key={title} className="rule grid grid-cols-1 gap-1 py-3 md:grid-cols-[18rem_1fr] md:gap-6">
              <span className="text-sm">{title}</span>
              <span className="text-sm text-muted">{body}</span>
            </div>
          ))}
        </div>
      </Module>

      <Module className="flex flex-col gap-3">
        <Label>What RouteDust always does</Label>
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
          More detail on the words, the providers and what to do when a route stops is in <Link href="/docs" className="underline underline-offset-2">Docs</Link>.
        </p>
      </Module>
    </div>
  );
}
