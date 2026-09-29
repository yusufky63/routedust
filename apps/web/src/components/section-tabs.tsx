import Link from "next/link";

export interface SectionTab<K extends string> {
  key: K;
  href: string;
  label: string;
  /** One line under the label. */
  hint: string;
  icon: React.ReactNode;
}

/** Views of one section as the page's main switch: full-width, icon, label and hint per tab. */
export function SectionTabs<K extends string>({ tabs, active, label }: { tabs: readonly SectionTab<K>[]; active: K; label: string }) {
  return (
    <nav className="segmented segmented-lg" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}>
          <span aria-hidden className={`shrink-0 ${t.key === active ? "text-accent" : ""}`}>
            {t.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span>{t.label}</span>
            <span className="truncate text-xs font-normal text-muted">{t.hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const TAB_ICONS = {
  swap: (
    <Svg>
      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </Svg>
  ),
  bridge: (
    <Svg>
      <path d="M2 18h20M4 18v-4a8 8 0 0 1 16 0v4M9 18v-3M15 18v-3M12 18v-4" />
    </Svg>
  ),
  faucet: (
    <Svg>
      <path d="M12 3s-5 5.6-5 9.5a5 5 0 0 0 10 0C17 8.6 12 3 12 3Z" />
    </Svg>
  ),
};
