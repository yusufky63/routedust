export interface NavItem {
  href: string;
  label: string;
  hint?: string;
  /** Other sections this item stands for: "Bridges / Faucets" is active on /faucets too. */
  also?: string[];
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Router" },
  // One entry for both: /swap and /swap/bridge switch with the page's own tabs.
  { href: "/swap", label: "Swap / Bridge" },
  { href: "/balances", label: "Balances" },
  { href: "/activity", label: "Activity" },
  // Same idea: /bridges and /faucets switch with FundsTabs.
  { href: "/bridges", label: "Bridges / Faucets", also: ["/faucets"] },
];

export const NETWORK_NAV: NavItem[] = [
  { href: "/networks", label: "Networks", hint: "chains, native gas, RPC health, add to wallet" },
  { href: "/protocols", label: "Protocols", hint: "live provider capabilities" },
  { href: "/coverage", label: "Coverage", hint: "which testnets each provider supports" },
  { href: "/liquidity", label: "Liquidity", hint: "create a pool for your own token" },
  { href: "/status", label: "Status", hint: "whether the endpoints and APIs we rely on answer" },
];

function matches(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether `item` owns `pathname`; the longest matching href wins among `siblings`. */
export function owns(item: NavItem, pathname: string, siblings: NavItem[]): boolean {
  const hrefs = (n: NavItem) => [n.href, ...(n.also ?? [])];
  const best = (n: NavItem) => Math.max(-1, ...hrefs(n).filter((h) => matches(h, pathname)).map((h) => h.length));
  const mine = best(item);
  if (mine < 0) return false;
  return !siblings.some((n) => n !== item && best(n) > mine);
}
