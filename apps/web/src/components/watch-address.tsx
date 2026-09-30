"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import { Button, LinkAction } from "./ui";
import { shortAddress } from "@testnet-router/core";
import { useRouterStore } from "@/lib/store";

/** The `?watch=` value already applied on this page load. */
let appliedWatchParam: string | undefined;

/**
 * `?watch=0x…` starts watching that address: a shareable, read-only link to a
 * wallet's plan. A connected wallet always wins over it. Each link value is
 * applied once, so "Stop watching" or another address is not undone while the
 * parameter stays in the URL.
 */
export function WatchAddressLink() {
  const params = useSearchParams();
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const requested = params.get("watch");
  useEffect(() => {
    if (!requested || !isAddress(requested) || requested.toLowerCase() === appliedWatchParam) return;
    appliedWatchParam = requested.toLowerCase();
    if (requested.toLowerCase() !== useRouterStore.getState().watchAddress?.toLowerCase()) setWatchAddress(requested as Address);
  }, [requested, setWatchAddress]);
  return null;
}

export function WatchAddressForm({
  compact = false,
  autoFocus = false,
  submitLabel = "Watch",
  onDone,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const [value, setValue] = useState("");
  const valid = isAddress(value);
  return (
    <form
      className={`flex ${compact ? "flex-row items-center" : "flex-col md:flex-row md:items-center"} gap-2`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setWatchAddress(value as Address);
        setValue("");
        onDone?.();
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.trim())}
        placeholder="0x… address to watch"
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full md:w-96"
        aria-label="Address to watch"
      />
      <Button type="submit" variant="accent" disabled={!valid}>
        {submitLabel}
      </Button>
    </form>
  );
}

/**
 * Watching without a wallet: swap the address for another one, or stop. With a
 * wallet connected there is nothing to switch, so only the form for a first
 * watch is shown (and nothing at all while a wallet is in charge).
 */
export function WatchSwitcher({ className = "" }: { className?: string }) {
  const { address: connected } = useAccount();
  const watched = useRouterStore((s) => s.watchAddress);
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const [open, setOpen] = useState(false);

  if (connected) return null;
  if (!watched || open) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <WatchAddressForm autoFocus={open} submitLabel={watched ? "Watch this one" : "Watch"} onDone={() => setOpen(false)} />
        {watched ? (
          <LinkAction onClick={() => setOpen(false)} className="self-start">
            Keep watching {shortAddress(watched, 4)}
          </LinkAction>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex min-h-[30px] items-center gap-2 rounded-sm border border-border bg-inset px-2.5" title={watched}>
        <EyeIcon />
        <span className="label">Watching</span>
        <span className="mono text-sm">{shortAddress(watched, 6)}</span>
      </span>
      <Button variant="accent" onClick={() => setOpen(true)}>
        <SwapIcon />
        Watch another address
      </Button>
      <LinkAction onClick={() => setWatchAddress(undefined)} className="ml-1">
        Stop watching
      </LinkAction>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />
    </svg>
  );
}
