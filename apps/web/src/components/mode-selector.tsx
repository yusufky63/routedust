"use client";

import { MODE_DESCRIPTIONS, MODE_LABELS, ROUTE_MODES, type RouteMode } from "@testnet-router/core";

export function ModeSelector({ mode, onChange, disabled }: { mode: RouteMode; onChange: (m: RouteMode) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Route mode">
        {ROUTE_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === mode}
            onClick={() => onChange(m)}
            disabled={disabled}
            className={`btn ${m === mode ? "btn-active" : ""}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{MODE_DESCRIPTIONS[mode]}</p>
    </div>
  );
}
