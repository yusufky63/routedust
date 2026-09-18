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
      <div className="flex flex-col gap-3 text-sm text-muted [&_li]:leading-relaxed [&_strong]:text-text">{children}</div>
    </Module>
  );
}

const TOC = [
  ["concepts", "What the words mean"],
  ["providers", "Where routes come from"],
  ["planner", "How a route is chosen"],
  ["execution", "What protects you"],
  ["troubleshooting", "When something goes wrong"],
];

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Docs" meta="What RouteDust does with your testnet balances, in plain words">
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

      <Section id="concepts" title="What the words mean">
        <p>
          <strong>Gas asset.</strong> Every network charges fees in its own asset. On most of the {CHAINS.length} testnets here that is ETH, elsewhere MON, AVAX, POL, SEI, INJ and others. Arc is the odd one: there you pay fees in USDC. You always need a little of the network&apos;s own asset before anything can move.
        </p>
        <p>
          <strong>Wrapped.</strong> The tradable version of a gas asset (WETH for ETH, WMON for MON). Pools trade the wrapped one; RouteDust wraps and unwraps for you and, by default, hands you the real gas asset at the end rather than the wrapped copy.
        </p>
        <p>
          <strong>Not every USDC is the same USDC.</strong> USDC issued by Circle on a network, a bridged copy of it and a test token that merely calls itself USDC are different things. Routes keep them apart, so the target you pick is the one you get.
        </p>
        <p>
          <strong>Dust.</strong> The small leftovers faucets and tests spread across networks. Alone they are too small to be worth a transfer; gathered into one asset on one network they become usable again.
        </p>
        <p>
          <strong>Route.</strong> The steps needed to turn one balance into your target: a swap, a bridge, sometimes both. Every step has to be live at that moment, with a real price, or the route is not offered.
        </p>
      </Section>

      <Section id="providers" title="Where routes come from">
        <p>RouteDust moves nothing itself. It uses the networks&apos; own bridges and exchanges, and every card says which one it would use before you sign.</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Circle CCTP</strong> — the official way to move USDC between networks: burned on one side, minted on the other, so you receive real USDC and not a wrapper. Usually a minute or two. Either you submit the final step yourself, which needs a little gas on the destination, or Circle submits it for you for a small fee.
          </li>
          <li>
            <strong>Circle Gateway</strong> — deposit USDC once per network, then one signature moves all of it at once. Worth it when several networks hold USDC. The deposit has to settle first: seconds on Arc and the fast networks, about fifteen minutes on Sepolia.
          </li>
          <li>
            <strong>Uniswap and other exchanges</strong> — for turning one asset into another on the same network. Only pools that really hold liquidity are used, and the price impact of your own amount is always shown.
          </li>
          <li>
            <strong>Hyperlane, Stargate, Across, LI.FI and the Optimism bridge</strong> — alternatives for ETH and USDC, each with its own speed and cost. They deliver without gas on the destination, and on testnets they are best effort: when one is not answering, its routes are simply not offered.
          </li>
        </ul>
        <p>
          Which provider is answering right now is on <Link href="/protocols" className="underline underline-offset-2">Protocols</Link>; what each network supports is on{" "}
          <Link href="/coverage" className="underline underline-offset-2">Coverage</Link>.
        </p>
      </Section>

      <Section id="planner" title="How a route is chosen">
        <p>For every balance, in this order: keep back enough gas for the transactions that route will need, find the ways it could reach your target, price each of them for real, and keep the best one.</p>
        <p>
          <strong>You decide what &ldquo;best&rdquo; means.</strong> Best output keeps the most on the target. Fewest transactions asks for as few wallet prompts as possible. Fastest prefers the quickest path. Native only refuses to leave you holding a wrapped token. Max coverage tries to move as many balances as it can. Switching between them is instant.
        </p>
        <p>
          <strong>Too big for the pool.</strong> If converting the whole balance would move the price further than your limit (5% by default, in Settings), the route is offered for the amount that fits and marked PARTIAL, with the reason on the card. Nothing is dumped into a thin pool on your behalf.
        </p>
        <p>
          <strong>Several balances on one network</strong> can travel together: they are gathered into one asset first, then a single bridge carries the total. Fewer signatures, and the bridge fee is paid once.
        </p>
        <p>
          <strong>&ldquo;No route&rdquo; is a real answer.</strong> When a network has no gas, no pool or no live bridge, the card says which of those it was, and links the faucets when gas is what is missing.
        </p>
      </Section>

      <Section id="execution" title="What protects you">
        <ul className="list-disc pl-5">
          <li>You sign every transaction in your own wallet. RouteDust never holds your keys and cannot move anything on its own.</li>
          <li>Approvals are for the exact amount that step needs, to the contract that step uses. Never unlimited, never to an address you have not seen on the card.</li>
          <li>Every transaction is tried against the network before it reaches your wallet: one that would fail is not put in front of you, and the prompt is explained in plain words first.</li>
          <li>The cost is compared with your balance beforehand, so a route does not stop halfway because gas ran out.</li>
          <li>Contracts are remembered between runs. If one is replaced by a different one, you are told before you sign.</li>
          <li>A bridge transfer is never sent twice. After an interruption RouteDust looks for the transaction on the network and continues from it; when it cannot tell, it stops and asks you instead of guessing.</li>
          <li>Disconnecting your wallet only pauses a route, nothing fails on-chain. Reconnect and press Resume.</li>
          <li>Your history stays in this browser and is archived, never deleted. Activity can also find transfers that were sent but never arrived and finish them.</li>
        </ul>
      </Section>

      <Section id="troubleshooting" title="When something goes wrong">
        <ul className="list-disc pl-5">
          <li>
            <strong>The wallet asks to switch network</strong>: approve it. If your wallet does not know the testnet yet, RouteDust adds it first with a working endpoint; you can also do that from <Link href="/networks" className="underline underline-offset-2">Networks</Link>.
          </li>
          <li>
            <strong>Needs gas</strong>: the card names the network and links its faucets. Top up, then press Retry.
          </li>
          <li>
            <strong>The price moved</strong> between the quote and your signature: the transaction is refused before it can take anything. Retry prices it again; the tolerance is in Settings.
          </li>
          <li>
            <strong>Only part of the balance is routable</strong>: converting the rest would move the pool too far. Route it in parts, pick a target that needs no conversion (USDC to USDC only bridges), or raise the limit in Settings and accept the loss.
          </li>
          <li>
            <strong>&ldquo;The wallet holds less than the route was planned for&rdquo;</strong>: the balance changed after the plan was made. Rescan on the Router page and plan again.
          </li>
          <li>
            <strong>Sent but not arrived</strong>: Activity → Circle USDC burns on-chain → Scan finds USDC transfers that were never finished and lets you complete them, even from an old route.
          </li>
          <li>
            <strong>A network with no way out</strong>: a few testnets have no bridge, no pool and no Circle USDC, so nothing can route a balance off them. The card then links the network&apos;s own bridge instead. GIWA is one of these: withdrawing to Ethereum Sepolia is started there, proved on Sepolia after up to two hours, and finished after a challenge period of about seven days.
          </li>
          <li>
            <strong>A Gateway deposit is still waiting</strong>: Circle credits it only once the network settles. Until you sign, that USDC is still yours and can be withdrawn.
          </li>
        </ul>
        <p>
          A route can also explain itself: open it and press &ldquo;Why this route?&rdquo; to see where each step&apos;s data came from. The{" "}
          <a href="https://github.com/yusufky63/routedust" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            source code
          </a>{" "}
          is public.
        </p>
      </Section>
    </div>
  );
}
