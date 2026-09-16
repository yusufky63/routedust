"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { scanWallet, type Address, type ChainScanResult } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

/**
 * Scans the active address: the connected wallet, or a watched (read-only)
 * address when no wallet is connected.
 */
export function useScan() {
  const { address: connected } = useAccount();
  const watchAddress = useRouterStore((s) => s.watchAddress);
  const scan = useRouterStore((s) => s.scan);
  const setScan = useRouterStore((s) => s.setScan);
  const setPlan = useRouterStore((s) => s.setPlan);
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ChainScanResult[]>([]);
  const inflight = useRef<string | undefined>(undefined);

  const address: Address | undefined = connected ?? watchAddress;
  const watching = !connected && Boolean(watchAddress);

  const rescan = useCallback(async () => {
    if (!address) return;
    if (inflight.current === address) return;
    inflight.current = address;
    setScanning(true);
    setProgress([]);
    try {
      const result = await scanWallet(address, CHAINS, ASSETS, getClients(rpcOverrides), {
        onChain: (r) => setProgress((p) => [...p, r]),
      });
      setScan(result);
      setPlan(undefined);
    } finally {
      setScanning(false);
      inflight.current = undefined;
    }
  }, [address, rpcOverrides, setScan, setPlan]);

  // Scan automatically when the active address changes or the cached scan is stale.
  useEffect(() => {
    if (!address) return;
    if (scan && scan.wallet.toLowerCase() === address.toLowerCase() && Date.now() - scan.scannedAt < 5 * 60_000) return;
    void rescan();
  }, [address, scan, rescan]);

  const current = scan && address && scan.wallet.toLowerCase() === address.toLowerCase() ? scan : undefined;
  return { address, connected, watching, scan: current, scanning, progress, rescan };
}
