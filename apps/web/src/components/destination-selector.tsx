"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { checkTransferSanity, sanitizeName, sanitizeSymbol, verifyErc20, type Asset } from "@testnet-router/core";
import { CHAINS, DESTINATION_PRESETS } from "@testnet-router/registry";
import { useAllAssets } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";
import { Button, Marker, Tag } from "./ui";

function CustomTokenForm({ onAdded }: { onAdded: (asset: Asset) => void }) {
  const addCustomAsset = useRouterStore((s) => s.addCustomAsset);
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const [chainId, setChainId] = useState<number>(CHAINS[0]?.id ?? 11155111);
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
      <span className="label">Buy a token by address</span>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Token chain">
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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

export function DestinationSelector({ assetId, onChange, disabled }: { assetId: string; onChange: (id: string) => void; disabled?: boolean }) {
  const assets = useAllAssets();
  const removeCustomAsset = useRouterStore((s) => s.removeCustomAsset);
  const asset = assets.find((a) => a.id === assetId);
  const chain = asset ? CHAINS.find((c) => c.id === asset.chainId) : undefined;
  const [showCustom, setShowCustom] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Marker color={chain?.color} />
        <div className="-mt-1">
          <div className="display text-3xl uppercase leading-none md:text-4xl">{chain?.name ?? "—"}</div>
          <div className="display mt-2 flex items-center gap-3 text-3xl leading-none text-muted md:text-4xl">
            {asset?.symbol ?? "—"}
            {asset && !asset.verified ? <Tag tone="warn">UNVERIFIED TOKEN</Tag> : null}
          </div>
          <div className="mono mt-3 text-[11px] text-muted">
            {asset?.representation.replace(/_/g, " ").toLowerCase()} · {asset?.decimals} decimals
            {chain?.nativeAsset.erc20Mirror && asset?.kind === "NATIVE" ? " · also the gas asset" : ""}
            {asset?.address && !asset.verified ? ` · ${asset.address}` : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="label" htmlFor="destination-select">
          Change target
        </label>
        <select id="destination-select" value={assetId} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="max-w-md">
          {CHAINS.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {assets
                .filter((a) => a.chainId === c.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {c.name} / {a.symbol}
                    {a.verified ? "" : " (unverified)"}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">Presets</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {DESTINATION_PRESETS.map((p) => {
            const active = p.node.assetId === assetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.node.assetId)}
                disabled={disabled}
                title={p.description}
                className={`mono border-b text-[11px] uppercase tracking-[0.08em] ${active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
              >
                {p.label.replace("Consolidate ", "").replace(" to ", " → ")}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            disabled={disabled}
            className={`mono border-b text-[11px] uppercase tracking-[0.08em] ${showCustom ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
          >
            Custom token…
          </button>
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
      </div>
      {showCustom ? (
        <CustomTokenForm
          onAdded={(a) => {
            onChange(a.id);
            setShowCustom(false);
          }}
        />
      ) : null}
    </div>
  );
}
