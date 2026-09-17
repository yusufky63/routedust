"use client";

import { MODE_DESCRIPTIONS, MODE_LABELS, ROUTE_MODES, type RouteMode } from "@testnet-router/core";
import { Select } from "./ui";

/** Route-mode picker: one wide select with the description underneath. */
export function ModeSelector({ mode, onChange, disabled }: { mode: RouteMode; onChange: (m: RouteMode) => void; disabled?: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2 md:max-w-xl">
      <Select
        ariaLabel="Route mode"
        value={mode}
        onChange={onChange}
        disabled={disabled}
        className="w-full"
        buttonHint={false}
        options={ROUTE_MODES.map((m) => ({ value: m, label: MODE_LABELS[m], hint: MODE_DESCRIPTIONS[m] }))}
      />
      <p className="text-xs leading-relaxed text-muted">{MODE_DESCRIPTIONS[mode]}</p>
    </div>
  );
}
