"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { discoverWalletTokens, scanWallet, type Address, type Asset, type ChainScanResult, type TokenDiscoveryChainResult } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { uniswapProvider } from "@testnet-router/providers";
import { mergeAssets } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

export interface TokenSummary {
  indexed: number;
  verified: number;
  /** Tokens with at least one live DEX sell pool; everything else is dropped. */
  sellable: number;
}

/**
 * Scans the active address: the connected wallet, or a watched (read-only)
 * address when no wallet is connected. Wallet-discovered ERC-20s are kept
 * only when a live DEX pool can sell them; spam never reaches the UI.
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
  const [phase, setPhase] = useState<"idle" | "tokens" | "pools" | "balances">("idle");
  const [progress, setProgress] = useState<ChainScanResult[]>([]);
  const [tokenProgress, setTokenProgress] = useState<TokenDiscoveryChainResult[]>([]);
  const [tokenSummary, setTokenSummary] = useState<TokenSummary | undefined>(undefined);
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
    setTokenSummary(undefined);
    try {
      const clients = getClients(rpcOverrides);
      const fetchImpl = globalThis.fetch.bind(globalThis);
      let discovered: Asset[] = [];
      if (discoverTokens) {
        setPhase("tokens");
        try {
          const result = await discoverWalletTokens(address, CHAINS, ASSETS, clients, fetchImpl, {
            onChain: (r) => setTokenProgress((p) => [...p, r]),
          });
          let sellable: Asset[] = [];
          if (result.assets.length > 0) {
            // Keep only tokens a live Uniswap pool can actually sell; the rest is noise.
            setPhase("pools");
            const edges = await uniswapProvider.discover({
              chains: CHAINS,
              assets: [...ASSETS, ...result.assets],
              clients,
              fetch: fetchImpl,
              now: Date.now(),
              feeds: { uniswapDeployments: "/api/feeds/uniswap" },
            });
            const sellableIds = new Set(edges.filter((e) => e.type === "SWAP").map((e) => e.from.assetId));
            sellable = result.assets.filter((a) => sellableIds.has(a.id));
          }
          setTokenSummary({ indexed: result.chains.reduce((n, c) => n + c.indexed, 0), verified: result.assets.length, sellable: sellable.length });
          discovered = sellable;
        } catch {
          discovered = [];
        }
      }
      setDiscoveredAssets(discovered);
      setPhase("balances");
      const result = await scanWallet(address, CHAINS, mergeAssets(discovered, customAssets), clients, {
        onChain: (r) => setProgress((p) => [...p, r]),
      });
      setScan(result);
      setPlan(undefined);
    } finally {
      setScanning(false);
      setPhase("idle");
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
  return { address, connected, watching, scan: current, scanning, phase, progress, tokenProgress, tokenSummary, rescan };
}
