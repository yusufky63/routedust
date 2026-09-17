import Link from "next/link";

export const PRODUCT_NAME = "RouteDust";
export const PRODUCT_TAGLINE = "testnet router";

/**
 * Mark: scattered dust (three dots) gathered into one line that ends at a
 * single point. Monochrome with an accent endpoint; works at 16px.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="4" cy="6" r="1.6" fill="currentColor" opacity="0.55" />
      <circle cx="4" cy="12" r="1.6" fill="currentColor" opacity="0.75" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" opacity="0.95" />
      <path d="M7 6 C 12 6, 12 12, 16 12 M7 12 L16 12 M7 18 C 12 18, 12 12, 16 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 12 H 21" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="21" cy="12" r="2" fill="var(--accent)" />
    </svg>
  );
}

/**
 * "ROUTE" in the text colour, "DUST" in the accent: the dust is what gets
 * routed. The tagline sits under the name in small mono.
 */
export function Wordmark({ withTagline = true }: { withTagline?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="display text-base font-semibold leading-none tracking-brand">
        ROUTE<span className="text-accent">DUST</span>
      </span>
      {withTagline ? <span className="mono mt-1 text-2xs uppercase leading-none tracking-brand text-muted">{PRODUCT_TAGLINE}</span> : null}
    </span>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={`${PRODUCT_NAME} home`}>
      <LogoMark size={24} />
      <Wordmark />
    </Link>
  );
}
