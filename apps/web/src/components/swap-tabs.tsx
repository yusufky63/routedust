import Link from "next/link";

const TABS = [
  { key: "swap", href: "/swap", label: "Swap" },
  { key: "bridge", href: "/swap/bridge", label: "Bridge" },
] as const;

/** Same chain (Swap) or another chain (Bridge): two views of one section. */
export function SwapTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="segmented" aria-label="Swap or bridge">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
