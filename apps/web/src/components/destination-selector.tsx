"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { checkTransferSanity, sanitizeName, sanitizeSymbol, verifyErc20, type Asset } from "@testnet-router/core";
import { CHAINS, DESTINATION_PRESETS } from "@testnet-router/registry";
import { useAllAssets } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";
import { AssetIcon, ChainIcon } from "./icons";
import { Button, Tag } from "./ui";

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

  const submit = async () => {
    if (!isAddress(address)) {
      setError("enter a contract address");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const client = getClients(rpcOverrides).get(chainId);
      const check = await verifyErc20(client, address as Address);
      if (!check.hasCode) throw new Error("no contract at this address on the selected chain");
      if (check.decimals === undefined) throw new Error(check.error ?? "not an ERC-20 (decimals() failed)");
      // Never offer a buy for a token that cannot be moved afterwards.
      const risk = await checkTransferSanity(client, address as Address, check.decimals);
      if (risk.transfer === "blocked") throw new Error(`transfer check failed: ${risk.detail ?? "transfers revert"} (possible honeypot)`);
      if (risk.transfer === "fee") throw new Error(`transfer check failed: ${risk.detail ?? "fee on transfer"}; Uniswap v3 swaps would revert`);
      const asset: Asset = {
        id: `${chainId}:${address.toLowerCase()}`,
        chainId,
        canonicalAssetId: `TOKEN:${address.toLowerCase()}`,
        kind: "ERC20",
        address: address as Address,
        decimals: check.decimals,
        symbol: sanitizeSymbol(check.symbol),
        name: sanitizeName(check.symbol, "User-added token"),
        representation: "UNKNOWN",
        verified: false,
        risk,
        source: { kind: "runtime", url: `${CHAINS.find((c) => c.id === chainId)?.explorerUrl}/address/${address}`, lastVerifiedAt: new Date().toISOString(), note: "Added by the user; identity unverified" },
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
          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Token chain">
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x… token contract" spellCheck={false} className="w-full md:w-80" aria-label="Token contract address" />
        <Button variant="accent" onClick={() => void submit()} disabled={busy || !isAddress(address)}>
          {busy ? "Checking…" : "Add"}
        </Button>
      </div>
      {error ? <span className="mono text-[11px] text-error">{error}</span> : null}
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
 * Target picker: click a chain card, then an asset card. No dropdown needed.
 */
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {asset ? <AssetIcon asset={asset} size={28} /> : null}
        <div className="-mt-1">
          <div className="display flex items-center gap-2 text-3xl uppercase leading-none md:text-4xl">
            {asset ? <ChainIcon chainId={asset.chainId} size={22} /> : null}
            {CHAINS.find((c) => c.id === asset?.chainId)?.name ?? "—"}
          </div>
          <div className="display mt-2 flex items-center gap-3 text-3xl leading-none text-muted md:text-4xl">
            {asset?.symbol ?? "—"}
            {asset && !asset.verified ? <Tag tone="warn">UNVERIFIED TOKEN</Tag> : null}
          </div>
          <div className="mono mt-3 text-[11px] text-muted">
            {asset ? (REPRESENTATION_LABEL[asset.representation] ?? asset.representation.toLowerCase()) : ""} · {asset?.decimals} decimals
            {asset?.address && !asset.verified ? ` · ${asset.address}` : ""}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label">Chain</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Target chain">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === activeChainId}
              disabled={disabled}
              onClick={() => setPickChainId(c.id)}
              className={`btn flex items-center gap-1.5 !px-2.5 !py-1 ${c.id === activeChainId ? "btn-active" : ""}`}
              title={c.name}
            >
              <ChainIcon chainId={c.id} size={14} /> {c.shortName}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label">Asset on {chain?.name}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Target asset">
          {chainAssets.map((a) => {
            const active = a.id === assetId;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(a.id)}
                className={`module-raised flex items-center gap-3 px-3 py-2 text-left transition-colors hover:border-text ${active ? "!border-accent" : ""}`}
              >
                <AssetIcon asset={a} size={18} />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm">{a.symbol}</span>
                  <span className="mono text-[10px] uppercase tracking-[0.06em] text-muted">{REPRESENTATION_LABEL[a.representation] ?? a.representation.toLowerCase()}</span>
                </span>
              </button>
            );
          })}
          {unverifiedTokens ? (
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            disabled={disabled}
            className={`module-raised flex items-center gap-3 px-3 py-2 text-left hover:border-text ${showCustom ? "!border-text" : ""}`}
          >
            <span className="mono text-lg leading-none text-muted">+</span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm">Custom token</span>
              <span className="mono text-[10px] uppercase tracking-[0.06em] text-muted">by address</span>
            </span>
          </button>
          ) : null}
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
              className={`mono border-b text-[11px] uppercase tracking-[0.08em] ${active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {p.label.replace("Consolidate ", "").replace(" to ", " → ")}
            </button>
          );
        })}
        {asset && !asset.verified ? (
          <button
            type="button"
            onClick={() => {
              removeCustomAsset(asset.id);
              onChange(DESTINATION_PRESETS[0]?.node.assetId ?? assetId);
            }}
            className="mono border-b border-transparent text-[11px] uppercase tracking-[0.08em] text-muted hover:text-text"
          >
            Remove custom
          </button>
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
    </div>
  );
}
