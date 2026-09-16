"use client";

import { MODE_LABELS, ROUTE_MODES, type RouteMode } from "@testnet-router/core";
import { Button } from "./ui";

export function ModeSelector({ mode, onChange, disabled }: { mode: RouteMode; onChange: (m: RouteMode) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Route mode">
      {ROUTE_MODES.map((m) => (
        <Button key={m} active={m === mode} onClick={() => onChange(m)} disabled={disabled} title={MODE_LABELS[m]}>
          {MODE_LABELS[m]}
        </Button>
      ))}
    </div>
  );
}
