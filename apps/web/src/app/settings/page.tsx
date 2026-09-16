"use client";

import { MODE_LABELS, ROUTE_MODES, type RouteMode } from "@testnet-router/core";
import { CHAINS } from "@testnet-router/registry";
import { Button, Label, Module, PageTitle, Rule, useMounted } from "@/components/ui";
import { DEFAULT_SETTINGS, useRouterStore } from "@/lib/store";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rule grid grid-cols-1 gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Button active={value} onClick={() => onChange(!value)} disabled={disabled}>
      {value ? "ON" : "OFF"}
    </Button>
  );
}

export default function SettingsPage() {
  const mounted = useMounted();
  const settings = useRouterStore((s) => s.settings);
  const setSettings = useRouterStore((s) => s.setSettings);
  const setScan = useRouterStore((s) => s.setScan);
  const setPlan = useRouterStore((s) => s.setPlan);
  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Settings" meta="RPCs · advanced routing filters · everything stays in this browser">
        <Button onClick={() => setSettings({ ...DEFAULT_SETTINGS, theme: settings.theme })}>Reset defaults</Button>
      </PageTitle>

      <Module>
        <Label>Routing</Label>
        <Row label="Route mode" hint="Objective used to rank live candidates">
          <select value={settings.mode} onChange={(e) => setSettings({ mode: e.target.value as RouteMode })}>
            {ROUTE_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Allow wrapped outputs" hint="Wrapped representations are shown but excluded unless enabled">
          <Toggle value={settings.allowWrappedOutput} onChange={(v) => setSettings({ allowWrappedOutput: v })} disabled={settings.mode === "NATIVE_ONLY"} />
        </Row>
        <Row label="Max bridge hops">
          <input type="number" min={1} max={3} value={settings.maxBridges} onChange={(e) => setSettings({ maxBridges: Number(e.target.value) })} className="w-20" />
        </Row>
        <Row label="Max swap hops">
          <input type="number" min={0} max={3} value={settings.maxSwaps} onChange={(e) => setSettings({ maxSwaps: Number(e.target.value) })} className="w-20" />
        </Row>
        <Row label="Approval mode" hint="Exact amount approvals only; infinite approvals are never requested">
          <span className="mono text-xs">EXACT</span>
        </Row>
        <Row label="Slippage tolerance" hint="Basis points applied to DEX quotes">
          <input type="number" min={10} max={1000} value={settings.slippageBps} onChange={(e) => setSettings({ slippageBps: Number(e.target.value) })} className="w-24" />
        </Row>
        <Row label="Gas safety multiplier" hint="Reserve = gas units × max fee × multiplier (1.20–1.35 suggested)">
          <input
            type="number"
            min={1}
            max={2}
            step={0.05}
            value={settings.gasSafetyMultiplier}
            onChange={(e) => setSettings({ gasSafetyMultiplier: Number(e.target.value) })}
            className="w-24"
          />
        </Row>
        <Row label="Discover sellable wallet tokens" hint="List other ERC-20s through public Blockscout indexers and keep only those a live Uniswap pool can sell; everything unverified without a pool is dropped. Off = registry assets only.">
          <Toggle value={settings.discoverTokens} onChange={(v) => setSettings({ discoverTokens: v })} />
        </Row>
        <Row label="Simulate before signing" hint="eth_call every transaction first; failures are surfaced before the wallet prompt">
          <Toggle value={settings.simulateBeforeSign} onChange={(v) => setSettings({ simulateBeforeSign: v })} />
        </Row>
        <Row label="Experimental routes" hint="Allow chain revisits and bridge-after-bridge relays">
          <Toggle value={settings.experimentalRoutes} onChange={(v) => setSettings({ experimentalRoutes: v })} />
        </Row>
        <Row label="Theme">
          <Button active={settings.theme === "dark"} onClick={() => setSettings({ theme: "dark" })}>
            Dark
          </Button>
          <Button active={settings.theme === "light"} onClick={() => setSettings({ theme: "light" })}>
            Light
          </Button>
        </Row>
      </Module>

      <Module>
        <Label>RPC overrides</Label>
        <p className="mt-1 text-xs text-muted">Optional. Your endpoint is tried first, then the public fallbacks. Endpoints returning the wrong chain ID are rejected.</p>
        <div className="mt-2 flex flex-col">
          {CHAINS.map((c) => (
            <Row key={c.id} label={c.name} hint={c.rpcUrls[0]}>
              <input
                type="url"
                placeholder="https://"
                value={settings.rpcOverrides[c.id] ?? ""}
                onChange={(e) => setSettings({ rpcOverrides: { ...settings.rpcOverrides, [c.id]: e.target.value } })}
                className="w-full md:w-96"
              />
            </Row>
          ))}
        </div>
      </Module>

      <Module>
        <Label>Local data</Label>
        <Rule className="my-3" />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setScan(undefined);
              setPlan(undefined);
            }}
          >
            Clear scan & plan
          </Button>
        </div>
      </Module>
    </div>
  );
}
