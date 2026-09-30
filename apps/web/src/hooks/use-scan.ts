"use client";

import { useCallback, useEffect } from "react";

import { useAccount } from "wagmi";
import { create } from "zustand";
import {
  checkTransferSanity,
  mapLimit,
  discoverWalletTokens,
  scanWallet,
  type Address,
  type Asset,
  type ChainScanResult,
  type TokenDiscoveryChainResult,
} from "@testnet-router/core";
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
  /** Sellable tokens dropped because a plain transfer lost value or reverted. */
  rejected: number;
}

interface ScanStatus {
  /** Address being scanned right now, if any. */
  inflight?: string;
  phase: "idle" | "tokens" | "pools" | "balances";
  progress: ChainScanResult[];
  tokenProgress: TokenDiscoveryChainResult[];
  tokenSummary?: TokenSummary;
}

/**
 * Scan progress shared by every page: a scan started on the Router keeps
 * running (and showing) after you open Balances and come back.
 */
const useScanStatus = create<ScanStatus>(() => ({ phase: "idle", progress: [], tokenProgress: [] }));
const setStatus = (patch: Partial<ScanStatus> | ((s: ScanStatus) => Partial<ScanStatus>)) => useScanStatus.setState(patch);

/** A persisted scan older than this is refreshed once when the app loads; moving between pages never rescans. */
const STALE_ON_LOAD_MS = 5 * 60_000;
/** Addresses whose scan was accepted (or started) since this page load. */
const checkedThisLoad = new Set<string>();
/** Bumped by every scan start: a scan overtaken by a newer one (the address changed meanwhile) reports nothing. */
let scanSeq = 0;

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
  const discoverTokens = useRouterStore((s) => s.settings.unverifiedTokens);
  const { inflight, phase, progress, tokenProgress, tokenSummary } = useScanStatus();

  const address: Address | undefined = connected ?? watchAddress;
  const watching = !connected && Boolean(watchAddress);

  const rescan = useCallback(async () => {
    if (!address) return;
    if (useScanStatus.getState().inflight === address) return;
    const seq = ++scanSeq;
    const latest = () => seq === scanSeq;
    checkedThisLoad.add(address.toLowerCase());
    setStatus({ inflight: address, progress: [], tokenProgress: [], tokenSummary: undefined });
    const setPhase = (phase: ScanStatus["phase"]) => {
      if (latest()) setStatus({ phase });
    };
    try {
      const clients = getClients(rpcOverrides);
      const fetchImpl = globalThis.fetch.bind(globalThis);
      let discovered: Asset[] = [];
      if (discoverTokens) {
        setPhase("tokens");
        try {
          const result = await discoverWalletTokens(address, CHAINS, ASSETS, clients, fetchImpl, {
            onChain: (r) => {
              if (latest()) setStatus((s) => ({ tokenProgress: [...s.tokenProgress, r] }));
            },
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
          // Honeypot / fee-on-transfer check on the few survivors (state-override simulation).
          const checked = await mapLimit(sellable, 4, async (asset): Promise<Asset> => {
            const risk = await checkTransferSanity(clients.get(asset.chainId), asset.address as Address, asset.decimals);
            return { ...asset, risk };
          });
          const kept = checked.filter((a) => a.risk?.transfer !== "blocked" && a.risk?.transfer !== "fee");
          if (!latest()) return;
          setStatus({
            tokenSummary: {
              indexed: result.chains.reduce((n, c) => n + c.indexed, 0),
              verified: result.assets.length,
              sellable: kept.length,
              rejected: checked.length - kept.length,
            },
          });
          discovered = kept;
        } catch {
          discovered = [];
        }
      }
      if (!latest()) return;
      setDiscoveredAssets(discovered);
      setPhase("balances");
      const result = await scanWallet(address, CHAINS, mergeAssets(discovered, customAssets, discoverTokens), clients, {
        onChain: (r) => {
          if (latest()) setStatus((s) => ({ progress: [...s.progress, r] }));
        },
      });
      // A scan of the previous address must not replace the one for the address now shown.
      if (!latest()) return;
      setScan(result);
      setPlan(undefined);
    } finally {
      if (latest()) setStatus({ inflight: undefined, phase: "idle" });
    }
  }, [address, rpcOverrides, discoverTokens, customAssets, setScan, setPlan, setDiscoveredAssets]);

  // Scan when the active address has no scan yet, or once per page load when the saved one is stale.
  // Coming back to a page keeps the scan you already have: Rescan refreshes it on demand.
  useEffect(() => {
    if (!address) return;
    const key = address.toLowerCase();
    const have = scan && scan.wallet.toLowerCase() === key;
    if (have && (checkedThisLoad.has(key) || Date.now() - scan.scannedAt < STALE_ON_LOAD_MS)) {
      checkedThisLoad.add(key);
      return;
    }
    if (useScanStatus.getState().inflight === address) return;
    void rescan();
  }, [address, scan, rescan]);

  const current = scan && address && scan.wallet.toLowerCase() === address.toLowerCase() ? scan : undefined;
  const scanning = inflight !== undefined && inflight === address;
  return { address, connected, watching, scan: current, scanning, phase, progress, tokenProgress, tokenSummary, rescan };
}
