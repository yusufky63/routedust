"use client";

import { useQuery } from "@tanstack/react-query";
import { computeGasReserve, feePerGas } from "@testnet-router/core";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

/**
 * What to keep back on `chainId` for a route's own transactions: quoted (or
 * baseline) gas units × the current max fee × the safety multiplier, plus any
 * native fee the route pays as msg.value. Undefined until the fee is known.
 * Swap and Bridge both size MAX with it, so the executor's gas check before
 * signing never finds the balance spent on the amount itself.
 */
export function useGasReserve(chainId: number, gasUnits: bigint, extraNativeWei?: bigint): bigint | undefined {
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const multiplier = useRouterStore((s) => s.settings.gasSafetyMultiplier);
  const fee = useQuery({
    queryKey: ["fee-per-gas", chainId, rpcOverrides],
    queryFn: () => feePerGas(getClients(rpcOverrides).get(chainId)),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  if (fee.data === undefined || gasUnits <= 0n) return undefined;
  return computeGasReserve({ nativeBalance: 0n, estimatedGasUnits: gasUnits, maxFeePerGas: fee.data, safetyMultiplier: multiplier, extraNativeWei }).reserve;
}
