"use client";

import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { checkTransferSanity, sanitizeName, sanitizeSymbol, searchBlockscoutTokens, verifyErc20, type Asset, type TokenSearchHit } from "@testnet-router/core";
import { CHAINS, DESTINATION_PRESETS } from "@testnet-router/registry";
import { useAllAssets } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";
import { AssetIcon, ChainIcon } from "./icons";
import { Button, Select, Tag } from "./ui";

export function CustomTokenForm({
  onAdded,
  fixedChainId,
  label = "Buy a token by address",
}: {
  onAdded: (asset: Asset) => void;
  /** Lock the chain (e.g. the Swap page already chose one). */
  fixedChainId?: number;
  label?: string;
}) {
  const addCustomAsset = useRouterStore((s) => s.addCustomAsset);
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const [ownChainId, setChainId] = useState<number>(CHAINS[0]?.id ?? 11155111);
  const chainId = fixedChainId ?? ownChainId;
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<TokenSearchHit[] | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const indexer = CHAINS.find((c) => c.id === chainId)?.tokenIndexer;

  // Symbol / name search through the chain's Blockscout, debounced.
  useEffect(() => {
    if (!indexer || search.trim().length < 2 || isAddress(search.trim())) {
      setHits(undefined);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const result = await searchBlockscoutTokens(globalThis.fetch.bind(globalThis), indexer.baseUrl, search.trim());
        if (!cancelled) setHits(result);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, indexer]);

  const submit = async (candidate = address) => {
    if (!isAddress(candidate)) {
      setError("enter a contract address");
      return;
    }
    setAddress(candidate);
    setBusy(true);
    setError(undefined);
    try {
      const client = getClients(rpcOverrides).get(chainId);
      const check = await verifyErc20(client, candidate as Address);
      if (!check.hasCode) throw new Error("no contract at this address on the selected chain");
      if (check.decimals === undefined) throw new Error(check.error ?? "not an ERC-20 (decimals() failed)");
      // Never offer a buy for a token that cannot be moved afterwards.
      const risk = await checkTransferSanity(client, candidate as Address, check.decimals);
      if (risk.transfer === "blocked") throw new Error(`transfer check failed: ${risk.detail ?? "transfers revert"} (possible honeypot)`);
      if (risk.transfer === "fee") throw new Error(`transfer check failed: ${risk.detail ?? "fee on transfer"}; Uniswap v3 swaps would revert`);
      const asset: Asset = {
        id: `${chainId}:${candidate.toLowerCase()}`,
        chainId,
        canonicalAssetId: `TOKEN:${candidate.toLowerCase()}`,
        kind: "ERC20",
        address: candidate as Address,
        decimals: check.decimals,
        symbol: sanitizeSymbol(check.symbol),
        name: sanitizeName(check.symbol, "User-added token"),
        representation: "UNKNOWN",
        verified: false,
        risk,
        source: { kind: "runtime", url: `${CHAINS.find((c) => c.id === chainId)?.explorerUrl}/address/${candidate}`, lastVerifiedAt: new Date().toISOString(), note: "Added by the user; identity unverified" },
      };
      addCustomAsset(asset);
      onAdded(asset);
      setAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {fixedChainId === undefined ? (
          <Select
            ariaLabel="Token chain"
            value={chainId}
            onChange={setChainId}
            searchable
            className="w-52"
            options={CHAINS.map((c) => ({ value: c.id, label: c.name, icon: <ChainIcon chainId={c.id} size={14} /> }))}
          />
        ) : null}
        <input
          value={address || search}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (isAddress(v)) {
              setAddress(v);
              setSearch("");
            } else {
              setAddress("");
              setSearch(e.target.value);
            }
          }}
          placeholder={indexer ? "0x… contract, or search by symbol / name" : "0x… token contract"}
          spellCheck={false}
          className="w-full md:w-80"
          aria-label="Token contract address or search"
        />
        <Button variant="accent" onClick={() => void submit()} disabled={busy || !isAddress(address)}>
          {busy ? "Checking…" : "Add"}
        </Button>
      </div>
      {searching ? <span className="mono text-xs text-muted">searching {indexer?.baseUrl.replace(/^https?:\/\//, "")}…</span> : null}
      {hits && hits.length === 0 && !searching ? <span className="mono text-xs text-muted">no ERC-20 matches on this chain's explorer</span> : null}
      {hits && hits.length > 0 ? (
        <ul className="popover flex flex-col">
          {hits.map((h) => (
            <li key={h.address}>
              <button type="button" className="popover-item flex-wrap justify-between" onClick={() => void submit(h.address)} disabled={busy}>
                <span className="flex items-center gap-2">
                  <span>{h.symbol}</span>
                  <span className="text-xs text-muted">{h.name}</span>
                  {h.contractVerified ? <Tag tone="ok">SOURCE VERIFIED</Tag> : <Tag tone="warn">UNVERIFIED SOURCE</Tag>}
                </span>
                <span className="mono text-xs text-muted">
                  {h.holders !== undefined ? `${h.holders} holders · ` : ""}
                  {h.address.slice(0, 10)}…
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <span className="mono text-xs text-error">{error}</span> : null}
      <span className="text-xs text-muted">A buy route exists only if a live Uniswap pool quotes USDC or native → token on that chain. Symbol and name are display data.</span>
    </div>
  );
}

const REPRESENTATION_LABEL: Record<string, string> = {
  NATIVE: "native gas",
  CIRCLE_NATIVE: "Circle USDC",
  WRAPPED_NATIVE: "wrapped",
  UNKNOWN: "unverified",
  CANONICAL: "canonical",
};

/**
 * Target picker: a chain select and an asset select side by side, presets
 * underneath. Compact by design; the big summary lives on the route cards.
 */
/** "Send to another address": the recipient of every route and swap; empty = the connected wallet. */
export function RecipientField({ disabled }: { disabled?: boolean }) {
  const recipient = useRouterStore((s) => s.settings.recipient);
  const setSettings = useRouterStore((s) => s.setSettings);
  const [open, setOpen] = useState(Boolean(recipient));
  const valid = recipient === "" || isAddress(recipient);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          if (open) setSettings({ recipient: "" });
          setOpen(!open);
        }}
        disabled={disabled}
        className={`mono self-start border-b text-xs uppercase tracking-label ${open ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
      >
        {open ? "− Send to the connected wallet instead" : "+ Send to another address"}
      </button>
      {open ? (
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <input
            value={recipient}
            onChange={(e) => setSettings({ recipient: e.target.value.trim() })}
            placeholder="0x… recipient on the target chain"
            spellCheck={false}
            className={`w-full md:w-96 ${!valid ? "border-error" : ""}`}
            aria-label="Recipient address"
            disabled={disabled}
          />
          <span className={`mono text-xs ${valid ? "text-muted" : "text-error"}`}>
            {recipient === "" ? "empty = your wallet" : valid ? "every route and swap lands here; an exchange deposit address may not credit testnet funds" : "not a valid address"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function DestinationSelector({ assetId, onChange, disabled }: { assetId: string; onChange: (id: string) => void; disabled?: boolean }) {
  const assets = useAllAssets();
  const removeCustomAsset = useRouterStore((s) => s.removeCustomAsset);
  const unverifiedTokens = useRouterStore((s) => s.settings.unverifiedTokens);
  const asset = assets.find((a) => a.id === assetId);
  const [pickChainId, setPickChainId] = useState<number | undefined>(undefined);
  const [showCustom, setShowCustom] = useState(false);
  const activeChainId = pickChainId ?? asset?.chainId ?? CHAINS[0]?.id ?? 0;
  const chain = CHAINS.find((c) => c.id === activeChainId);
  const chainAssets = assets.filter((a) => a.chainId === activeChainId);

  const pickChain = (id: number) => {
    setPickChainId(id);
    // Keep the same kind of asset when the chain changes (USDC stays USDC, native stays native).
    const same = assets.find((a) => a.chainId === id && a.canonicalAssetId === asset?.canonicalAssetId) ?? assets.find((a) => a.chainId === id && a.kind === "NATIVE");
    if (same) onChange(same.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="label">Chain</span>
          <Select
            ariaLabel="Target chain"
            value={activeChainId}
            onChange={pickChain}
            disabled={disabled}
            searchable
            options={CHAINS.map((c) => ({ value: c.id, label: c.name, hint: c.nativeAsset.symbol, icon: <ChainIcon chainId={c.id} size={16} /> }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="label">Asset on {chain?.shortName}</span>
          <Select
            ariaLabel="Target asset"
            value={asset?.chainId === activeChainId ? assetId : undefined}
            onChange={onChange}
            disabled={disabled}
            placeholder="Pick an asset"
            options={chainAssets.map((a) => ({
              value: a.id,
              label: a.symbol,
              hint: `${REPRESENTATION_LABEL[a.representation] ?? a.representation.toLowerCase()} · ${a.decimals} dec`,
              icon: <AssetIcon asset={a} size={16} />,
            }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="label">Presets</span>
        {DESTINATION_PRESETS.map((p) => {
          const active = p.node.assetId === assetId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPickChainId(p.node.chainId);
                onChange(p.node.assetId);
              }}
              disabled={disabled}
              title={p.description}
              className={`mono border-b text-xs uppercase tracking-label ${active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {p.label.replace("Consolidate ", "").replace(" to ", " → ")}
            </button>
          );
        })}
        {unverifiedTokens ? (
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            disabled={disabled}
            className={`mono border-b text-xs uppercase tracking-label ${showCustom ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
          >
            + Custom token
          </button>
        ) : null}
        {asset && !asset.verified ? (
          <>
            <Tag tone="warn">UNVERIFIED TOKEN</Tag>
            <button
              type="button"
              onClick={() => {
                removeCustomAsset(asset.id);
                onChange(DESTINATION_PRESETS[0]?.node.assetId ?? assetId);
              }}
              className="mono border-b border-transparent text-xs uppercase tracking-label text-muted hover:text-text"
            >
              Remove custom
            </button>
          </>
        ) : null}
      </div>

      {showCustom ? (
        <CustomTokenForm
          fixedChainId={activeChainId}
          label={`Buy a token by address on ${chain?.name}`}
          onAdded={(a) => {
            onChange(a.id);
            setShowCustom(false);
          }}
        />
      ) : null}

      <RecipientField disabled={disabled} />
    </div>
  );
}
