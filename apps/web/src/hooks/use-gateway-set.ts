"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, ConsolidationPlan } from "@testnet-router/core";
import { gatewaySetCandidates, offerGatewaySet, type GatewaySetOffer } from "@testnet-router/providers";
import { findAnyAsset } from "@/lib/assets";

export type GatewaySetView = GatewaySetOffer;

/** Circle Gateway pooled transfer for the current plan (see offerGatewaySet for when it is offered). */
export function useGatewaySet(plan: ConsolidationPlan | undefined, wallet: Address | undefined, recipient: Address | undefined) {
  const destination = plan ? findAnyAsset(plan.destination.assetId) : undefined;
  const candidates = plan ? gatewaySetCandidates(plan, destination) : [];

  return useQuery({
    queryKey: ["gateway-set", plan?.id, wallet, recipient, candidates.map((s) => `${s.id}:${s.routable}`).join("|")],
    enabled: Boolean(plan && wallet && destination && candidates.length >= 2),
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: async (): Promise<GatewaySetOffer | null> => {
      if (!plan || !wallet || !destination) return null;
      return offerGatewaySet({ plan, destination, wallet, recipient: recipient ?? wallet, fetch: globalThis.fetch.bind(globalThis), now: Date.now() });
    },
  });
}
