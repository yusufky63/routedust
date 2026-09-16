"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { Button } from "./ui";
import { useRouterStore } from "@/lib/store";

export function WatchAddressForm({ compact = false }: { compact?: boolean }) {
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const [value, setValue] = useState("");
  const valid = isAddress(value);
  return (
    <form
      className={`flex ${compact ? "flex-row items-center" : "flex-col md:flex-row md:items-center"} gap-2`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setWatchAddress(value as Address);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.trim())}
        placeholder="0x… address to watch"
        spellCheck={false}
        autoComplete="off"
        className="w-full md:w-96"
        aria-label="Address to watch"
      />
      <Button type="submit" variant="accent" disabled={!valid}>
        Watch
      </Button>
    </form>
  );
}
