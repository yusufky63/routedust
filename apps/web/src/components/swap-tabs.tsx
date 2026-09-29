import { SectionTabs, TAB_ICONS, type SectionTab } from "./section-tabs";

const TABS: readonly SectionTab<"swap" | "bridge">[] = [
  { key: "swap", href: "/swap", label: "Swap", hint: "On the same chain", icon: TAB_ICONS.swap },
  { key: "bridge", href: "/swap/bridge", label: "Bridge", hint: "To another testnet", icon: TAB_ICONS.bridge },
];

/** Same chain (Swap) or another chain (Bridge): two views of one section. */
export function SwapTabs({ active }: { active: "swap" | "bridge" }) {
  return <SectionTabs tabs={TABS} active={active} label="Swap or bridge" />;
}
