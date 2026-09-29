import { SectionTabs, TAB_ICONS, type SectionTab } from "./section-tabs";

const TABS: readonly SectionTab<"faucets" | "bridges">[] = [
  { key: "faucets", href: "/faucets", label: "Faucets", hint: "Free test funds", icon: TAB_ICONS.faucet },
  { key: "bridges", href: "/bridges", label: "Bridges", hint: "Each chain's own", icon: TAB_ICONS.bridge },
];

/** External sources, split by what they do: faucets hand out funds, bridges move them. */
export function FundsTabs({ active }: { active: "faucets" | "bridges" }) {
  return <SectionTabs tabs={TABS} active={active} label="Faucets or bridges" />;
}
