"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Router" },
  { href: "/swap", label: "Swap" },
  { href: "/balances", label: "Balances" },
  { href: "/activity", label: "Activity" },
  { href: "/networks", label: "More" },
];

/**
 * Phone bottom bar. Lives outside the header on purpose: a fixed element
 * inside the header's backdrop-filter would be positioned inside the header.
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-bg/95 backdrop-blur md:hidden" aria-label="Primary (mobile)">
      {ITEMS.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 border-t-2 py-3 text-center text-sm font-medium ${active ? "-mt-px border-text text-text" : "border-transparent text-muted"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
