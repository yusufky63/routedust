import { SectionTabs, TAB_ICONS, type SectionTab } from "./section-tabs";

const TABS: readonly SectionTab<"bridges" | "faucets">[] = [
  { key: "bridges", href: "/bridges", label: "Bridges", hint: "Each chain's own", icon: TAB_ICONS.bridge },
  { key: "faucets", href: "/faucets", label: "Faucets", hint: "Free test funds", icon: TAB_ICONS.faucet },
];

/** External sources, split by what they do: bridges move funds, faucets hand them out. One header entry ("Bridges / Faucets"). */
export function FundsTabs({ active }: { active: "bridges" | "faucets" }) {
  return <SectionTabs tabs={TABS} active={active} label="Bridges or faucets" />;
}
