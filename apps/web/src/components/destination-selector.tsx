"use client";

import { ASSETS, CHAINS, DESTINATION_PRESETS, findAsset } from "@testnet-router/registry";
import { Button } from "./ui";

export function DestinationSelector({ assetId, onChange, disabled }: { assetId: string; onChange: (id: string) => void; disabled?: boolean }) {
  const asset = findAsset(assetId);
  const chain = asset ? CHAINS.find((c) => c.id === asset.chainId) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="display text-2xl uppercase leading-tight md:text-3xl">{chain?.name ?? "—"}</div>
        <div className="display text-2xl leading-tight text-muted md:text-3xl">{asset?.symbol ?? "—"}</div>
      </div>
      <select value={assetId} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Destination asset" className="max-w-md">
        {CHAINS.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {ASSETS.filter((a) => a.chainId === c.id).map((a) => (
              <option key={a.id} value={a.id}>
                {c.shortName} / {a.symbol} ({a.representation.toLowerCase().replace("_", " ")})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="flex flex-wrap gap-1">
        {DESTINATION_PRESETS.map((p) => (
          <Button key={p.id} active={p.node.assetId === assetId} onClick={() => onChange(p.node.assetId)} disabled={disabled} title={p.description}>
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
