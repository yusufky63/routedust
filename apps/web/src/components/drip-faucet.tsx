"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount } from "@testnet-router/core";
import { ChainIcon } from "./icons";
import { Button, ExternalLink, Select, Tag } from "./ui";
import { addressUrl, txUrl } from "@/lib/format";
import { useRouterStore } from "@/lib/store";
import type { FaucetStatus } from "@/lib/server/faucet";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, options: Record<string, unknown>): string;
      reset(id?: string): void;
      remove(id?: string): void;
    };
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    const script = existing ?? Object.assign(document.createElement("script"), { src: TURNSTILE_SRC, async: true, defer: true });
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("captcha failed to load")));
    if (!existing) document.head.appendChild(script);
  });
}

function Captcha({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string | undefined) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(undefined),
          "error-callback": () => onToken(undefined),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, [siteKey, onToken]);

  // A token is single use: every attempt gets a fresh challenge.
  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      onToken(undefined);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey, onToken]);

  if (failed) return <p className="meta text-error">The captcha could not load (blocked by an extension?).</p>;
  return <div ref={ref} className="min-h-[65px]" />;
}

function waitLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Result = { kind: "ok"; hash: string; chainId: number; amount: string } | { kind: "error"; message: string };

/**
 * RouteDust's own gas faucet: one captcha-protected claim per address and
 * connection per day. Renders nothing until the deployment is configured
 * (key, captcha, claim store) and at least one chain can pay out, so an
 * unfunded faucet is never advertised.
 */
export function DripFaucet({ focusChainId }: { focusChainId?: number }) {
  const { address: connected } = useAccount();
  const watch = useRouterStore((s) => s.watchAddress);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["faucet-status"],
    queryFn: async () => {
      const res = await fetch("/api/faucet", { cache: "no-store" });
      if (!res.ok) throw new Error(`faucet ${res.status}`);
      return (await res.json()) as FaucetStatus;
    },
    staleTime: 30_000,
  });
  const data = status.data;
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [address, setAddress] = useState("");
  const [token, setToken] = useState<string | undefined>(undefined);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | undefined>(undefined);
  const onToken = useRef((t: string | undefined) => setToken(t)).current;

  useEffect(() => {
    if (!address && (connected || watch)) setAddress((connected ?? watch) as string);
  }, [connected, watch, address]);
  useEffect(() => {
    if (chainId !== undefined || !data?.chains.length) return;
    const preferred = data.chains.find((c) => c.chainId === focusChainId && c.available) ?? data.chains.find((c) => c.available) ?? data.chains[0];
    setChainId(preferred?.chainId);
  }, [data, chainId, focusChainId]);

  const chain = data?.chains.find((c) => c.chainId === chainId);
  const ready = Boolean(data?.enabled && data.chains.some((c) => c.available));
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  const submit = async () => {
    if (!chain || !token) return;
    setBusy(true);
    setResult(undefined);
    try {
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: address.trim(), chainId: chain.chainId, captchaToken: token }) });
      const body = (await res.json()) as { hash?: string; amount?: string; error?: string; retryAfterSeconds?: number };
      if (res.ok && body.hash) {
        setResult({ kind: "ok", hash: body.hash, chainId: chain.chainId, amount: body.amount ?? chain.amount });
        void queryClient.invalidateQueries({ queryKey: ["faucet-status"] });
      } else {
        const wait = body.retryAfterSeconds && body.retryAfterSeconds > 0 ? ` · next claim in ${waitLabel(body.retryAfterSeconds)}` : "";
        setResult({ kind: "error", message: `${body.error ?? `Request failed (${res.status})`}${wait}` });
      }
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  };

  if (!ready) return null;

  return (
    <section className="module flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="display text-xl">RouteDust faucet</h2>
          <p className="text-sm text-muted">Gas to get started: once every {data?.cooldownHours ?? 24} hours per address and per connection, for wallets that have less than one drip.</p>
        </div>
        {data?.address ? (
          <span className="meta">
            faucet wallet{" "}
            <ExternalLink href={addressUrl(chainId ?? data.chains[0]?.chainId ?? 11155111, data.address)}>
              {data.address.slice(0, 6)}…{data.address.slice(-4)}
            </ExternalLink>
          </span>
        ) : null}
      </header>

      {data && data.chains.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="label">Network</span>
            <Select
              ariaLabel="Faucet network"
              value={chainId}
              onChange={(id) => {
                setChainId(id);
                setResult(undefined);
              }}
              options={data.chains.map((c) => ({
                value: c.chainId,
                label: c.name,
                hint: c.available ? `${formatAmount(BigInt(c.amount), c.decimals)} ${c.symbol}` : "empty",
                icon: <ChainIcon chainId={c.chainId} size={16} />,
              }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="label">Recipient</span>
            <input className="mono w-full" placeholder="0x… address" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} autoComplete="off" />
          </label>
          <Button variant="solid" className="btn-lg" disabled={!chain?.available || !validAddress || !token || busy} onClick={() => void submit()}>
            {busy ? "Sending…" : chain ? `Send ${formatAmount(BigInt(chain.amount), chain.decimals)} ${chain.symbol}` : "Send"}
          </Button>
        </div>
      ) : null}

      {data?.captchaSiteKey ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Captcha siteKey={data.captchaSiteKey} onToken={onToken} resetKey={resetKey} />
          {chain ? (
            <span className="flex items-center gap-2">
              {chain.available ? <Tag tone="ok">AVAILABLE</Tag> : <Tag tone="warn">EMPTY</Tag>}
              {chain.balance !== undefined ? (
                <span className="meta num">
                  faucet balance {formatAmount(BigInt(chain.balance), chain.decimals, { maxFractionDigits: 4 })} {chain.symbol}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {result?.kind === "ok" ? (
        <p className="text-sm text-success">
          Sent {chain ? `${formatAmount(BigInt(result.amount), chain.decimals)} ${chain.symbol}` : ""} ·{" "}
          <ExternalLink href={txUrl(result.chainId, result.hash)}>view transaction</ExternalLink>
        </p>
      ) : null}
      {result?.kind === "error" ? <p className="text-sm text-error">{result.message}</p> : null}
    </section>
  );
}
