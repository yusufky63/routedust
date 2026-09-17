"use client";

import { MODE_DESCRIPTIONS, MODE_LABELS, ROUTE_MODES, type RouteMode } from "@testnet-router/core";
import { Select } from "./ui";

/** Compact route-mode picker: one select, the description as a single muted line. */
export function ModeSelector({ mode, onChange, disabled, compact = true }: { mode: RouteMode; onChange: (m: RouteMode) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className={`flex ${compact ? "flex-wrap items-center gap-x-4 gap-y-2" : "flex-col gap-3"}`}>
      <Select
        ariaLabel="Route mode"
        value={mode}
        onChange={onChange}
        disabled={disabled}
        className="w-64"
        options={ROUTE_MODES.map((m) => ({ value: m, label: MODE_LABELS[m], hint: MODE_DESCRIPTIONS[m] }))}
      />
      <p className="text-xs text-muted">{MODE_DESCRIPTIONS[mode]}</p>
    </div>
  );
}
