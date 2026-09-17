import Link from "next/link";

export interface Screen {
  src: string;
  href: string;
  title: string;
  body: string;
}

/** Real screenshots of the running app (captured at 1440×900, dark theme). */
export const SCREENS: Screen[] = [
  {
    src: "/screens/router.png",
    href: "/",
    title: "Router",
    body: "Every balance with its own live route: what it sends, which hops it takes, what lands on the target, the gas it keeps back and how old the quote is.",
  },
  {
    src: "/screens/balances.png",
    href: "/balances",
    title: "Balances",
    body: "One row per network: native gas, the other assets found and whether each one has a route to the target right now.",
  },
  {
    src: "/screens/swap.png",
    href: "/swap",
    title: "Swap",
    body: "Same-chain buy and sell through live pools, with the price impact of your own size shown before you sign, never hidden in a tooltip.",
  },
  {
    src: "/screens/protocols.png",
    href: "/protocols",
    title: "Protocols",
    body: "Which provider answered, how many edges it produced and where each capability came from. Nothing is routed on the strength of a docs page.",
  },
  {
    src: "/screens/coverage.png",
    href: "/coverage",
    title: "Coverage",
    body: "Public registries side by side: which testnets each provider supports, which of them are already in ours and what a candidate is missing.",
  },
];

function Shot({ screen, priority }: { screen: Screen; priority?: boolean }) {
  return (
    <figure className="flex flex-col gap-2">
      <Link href={screen.href} className="module-interactive block overflow-hidden rounded-md border border-border p-0">
        {/* Plain <img>: these are fixed, already-optimised captures. */}
        <img
          src={screen.src}
          alt={`RouteDust ${screen.title} page`}
          width={1440}
          height={900}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="block h-auto w-full"
        />
      </Link>
      <figcaption className="flex flex-col gap-1">
        <span className="text-sm font-medium">{screen.title}</span>
        <span className="text-sm text-muted">{screen.body}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Screenshot gallery: the first shot full width, the rest side by side.
 * `limit` trims the list (the landing page shows three).
 */
export function Screens({ limit }: { limit?: number }) {
  const [lead, ...rest] = SCREENS.slice(0, limit ?? SCREENS.length);
  if (!lead) return null;
  return (
    <div className="flex flex-col gap-6">
      <Shot screen={lead} priority />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {rest.map((screen) => (
          <Shot key={screen.src} screen={screen} />
        ))}
      </div>
    </div>
  );
}
