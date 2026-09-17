"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requoteCandidate, type Address, type ConsolidationPlan, type RouteCandidate, type SourcePlan } from "@testnet-router/core";
import { currentAssets } from "@/lib/assets";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

export interface AmountState {
  /** Input amount chosen by the user (raw units of the source asset). */
  amount: bigint;
  /** Percentage preset that produced the amount, if any. */
  pct?: number;
  /** Fresh candidate for that amount; undefined while quoting or on error. */
  candidate?: RouteCandidate;
  quoting: boolean;
  error?: string;
}

const DEBOUNCE_MS = 450;

/**
 * Per-source amount overrides with debounced live re-quotes. The planner's
 * candidate is the default (100% of the routable balance).
 */
export function useRouteAmounts(plan: ConsolidationPlan | undefined, wallet: Address | undefined) {
  const [state, setState] = useState<Record<string, AmountState>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const requests = useRef<Record<string, number>>({});
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const slippageBps = useRouterStore((s) => s.settings.slippageBps);

  // A new plan invalidates every override.
  useEffect(() => {
    setState({});
    for (const t of Object.values(timers.current)) clearTimeout(t);
    timers.current = {};
  }, [plan?.id]);

  const setAmount = useCallback(
    (source: SourcePlan, amount: bigint, pct?: number, force = false) => {
      const base = source.selected;
      if (!base || !wallet) return;
      const capped = amount > source.routable ? source.routable : amount;
      if (capped === base.amountIn && !force) {
        // Back to the planner's own quote: no request needed.
        clearTimeout(timers.current[source.id]);
        setState((s) => {
          const next = { ...s };
          delete next[source.id];
          return next;
        });
        return;
      }
      setState((s) => ({ ...s, [source.id]: { amount: capped, pct, quoting: true } }));
      clearTimeout(timers.current[source.id]);
      const token = (requests.current[source.id] ?? 0) + 1;
      requests.current[source.id] = token;
      timers.current[source.id] = setTimeout(async () => {
        const result = await requoteCandidate({
          candidate: base,
          amountIn: capped,
          providers,
          clients: getClients(rpcOverrides),
          assets: currentAssets(),
          wallet,
          slippageBps,
        });
        if (requests.current[source.id] !== token) return; // superseded
        setState((s) => ({
          ...s,
          [source.id]:
            "candidate" in result
              ? { amount: capped, pct, candidate: result.candidate, quoting: false }
              : { amount: capped, pct, quoting: false, error: result.error },
        }));
      }, DEBOUNCE_MS);
    },
    [wallet, rpcOverrides, slippageBps],
  );

  const reset = useCallback((sourceId: string) => {
    clearTimeout(timers.current[sourceId]);
    setState((s) => {
      const next = { ...s };
      delete next[sourceId];
      return next;
    });
  }, []);

  /** The candidate that would be executed for this source right now. */
  const effective = useCallback(
    (source: SourcePlan): RouteCandidate | undefined => {
      const override = state[source.id];
      if (!override) return source.selected;
      return override.candidate;
    },
    [state],
  );

  return { state, setAmount, reset, effective };
}
