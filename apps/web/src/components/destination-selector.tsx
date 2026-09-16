"use client";

import { ASSETS, CHAINS, DESTINATION_PRESETS, findAsset } from "@testnet-router/registry";
import { Marker } from "./ui";

export function DestinationSelector({ assetId, onChange, disabled }: { assetId: string; onChange: (id: string) => void; disabled?: boolean }) {
  const asset = findAsset(assetId);
  const chain = asset ? CHAINS.find((c) => c.id === asset.chainId) : undefined;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Marker color={chain?.color} />
        <div className="-mt-1">
          <div className="display text-3xl uppercase leading-none md:text-4xl">{chain?.name ?? "—"}</div>
          <div className="display mt-2 text-3xl leading-none text-muted md:text-4xl">{asset?.symbol ?? "—"}</div>
          <div className="mono mt-3 text-[11px] text-muted">
            {asset?.representation.replace(/_/g, " ").toLowerCase()} · {asset?.decimals} decimals
            {chain?.nativeAsset.erc20Mirror && asset?.kind === "NATIVE" ? " · also the gas asset" : ""}
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
              {ASSETS.filter((a) => a.chainId === c.id).map((a) => (
                <option key={a.id} value={a.id}>
                  {c.name} / {a.symbol}
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
        </div>
      </div>
    </div>
  );
}
