"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import { Button, LinkAction } from "./ui";
import { shortAddress } from "@testnet-router/core";
import { useRouterStore } from "@/lib/store";

/**
 * `?watch=0x…` starts watching that address (shareable read-only link, also how
 * the screenshots are taken). The wallet, when connected, always wins.
 */
export function WatchAddressLink() {
  const params = useSearchParams();
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const current = useRouterStore((s) => s.watchAddress);
  const requested = params.get("watch");
  useEffect(() => {
    if (requested && isAddress(requested) && requested.toLowerCase() !== current?.toLowerCase()) setWatchAddress(requested as Address);
  }, [requested, current, setWatchAddress]);
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
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      <span className="meta">watching {shortAddress(watched, 6)}</span>
      <LinkAction onClick={() => setOpen(true)}>Watch another address</LinkAction>
      <LinkAction onClick={() => setWatchAddress(undefined)}>Stop watching</LinkAction>
    </div>
  );
}
