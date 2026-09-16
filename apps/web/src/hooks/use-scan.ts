"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { discoverWalletTokens, scanWallet, type Address, type Asset, type ChainScanResult, type TokenDiscoveryChainResult } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { mergeAssets } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

/**
 * Scans the active address: the connected wallet, or a watched (read-only)
 * address when no wallet is connected. Optionally lists the wallet's other
 * ERC-20s first so they can be sold through a DEX.
 */
export function useScan() {
  const { address: connected } = useAccount();
  const watchAddress = useRouterStore((s) => s.watchAddress);
  const scan = useRouterStore((s) => s.scan);
  const setScan = useRouterStore((s) => s.setScan);
  const setPlan = useRouterStore((s) => s.setPlan);
  const setDiscoveredAssets = useRouterStore((s) => s.setDiscoveredAssets);
  const customAssets = useRouterStore((s) => s.customAssets);
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const discoverTokens = useRouterStore((s) => s.settings.discoverTokens);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ChainScanResult[]>([]);
  const [tokenProgress, setTokenProgress] = useState<TokenDiscoveryChainResult[]>([]);
  const inflight = useRef<string | undefined>(undefined);

  const address: Address | undefined = connected ?? watchAddress;
  const watching = !connected && Boolean(watchAddress);

  const rescan = useCallback(async () => {
    if (!address) return;
    if (inflight.current === address) return;
    inflight.current = address;
    setScanning(true);
    setProgress([]);
    setTokenProgress([]);
    try {
      const clients = getClients(rpcOverrides);
      let discovered: Asset[] = [];
      if (discoverTokens) {
        try {
          const result = await discoverWalletTokens(address, CHAINS, ASSETS, clients, globalThis.fetch.bind(globalThis), {
            onChain: (r) => setTokenProgress((p) => [...p, r]),
          });
          discovered = result.assets;
        } catch {
          discovered = [];
        }
      }
      setDiscoveredAssets(discovered);
      const result = await scanWallet(address, CHAINS, mergeAssets(discovered, customAssets), clients, {
        onChain: (r) => setProgress((p) => [...p, r]),
      });
      setScan(result);
      setPlan(undefined);
    } finally {
      setScanning(false);
      inflight.current = undefined;
    }
  }, [address, rpcOverrides, discoverTokens, customAssets, setScan, setPlan, setDiscoveredAssets]);

  // Scan automatically when the active address changes or the cached scan is stale.
  useEffect(() => {
    if (!address) return;
    if (scan && scan.wallet.toLowerCase() === address.toLowerCase() && Date.now() - scan.scannedAt < 5 * 60_000) return;
    void rescan();
  }, [address, scan, rescan]);

  const current = scan && address && scan.wallet.toLowerCase() === address.toLowerCase() ? scan : undefined;
  return { address, connected, watching, scan: current, scanning, progress, tokenProgress, rescan };
}
