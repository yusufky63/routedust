import { createConfig, fallback, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";
import { toViemChain } from "@testnet-router/core";
import { CHAINS } from "@testnet-router/registry";

export const viemChains = CHAINS.map((c) => toViemChain(c)) as unknown as readonly [Chain, ...Chain[]];

export function viemChainById(id: number): Chain | undefined {
  return viemChains.find((c) => c.id === id);
}

let config: Config | undefined;

export function getWagmiConfig(): Config {
  if (config) return config;
  const transports = Object.fromEntries(
    viemChains.map((c) => [c.id, fallback(c.rpcUrls.default.http.map((u) => http(u, { timeout: 15_000, retryCount: 1 })))]),
  );
  config = createConfig({
    chains: viemChains,
    connectors: [injected({ shimDisconnect: true })],
    transports,
    ssr: true,
    multiInjectedProviderDiscovery: true,
  });
  return config;
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getWagmiConfig>;
  }
}
