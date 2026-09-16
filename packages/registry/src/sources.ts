import type { SourceProvenance } from "@testnet-router/core";

/** Research snapshot date of the spec + on-chain verification performed for this registry. */
export const REGISTRY_VERIFIED_AT = "2026-09-16T21:00:00Z";

function official(url: string, note?: string): SourceProvenance {
  return { kind: "official", url, lastVerifiedAt: REGISTRY_VERIFIED_AT, note };
}

function manual(url: string, note?: string): SourceProvenance {
  return { kind: "manual", url, lastVerifiedAt: REGISTRY_VERIFIED_AT, note };
}

/**
 * Primary research / provenance sources (spec section 44). Stored so the UI
 * can explain where every capability came from.
 */
export const SOURCES = {
  circleCctpDomains: official("https://developers.circle.com/cctp/concepts/supported-chains-and-domains"),
  circleCctpContracts: official(
    "https://developers.circle.com/cctp/references/contract-addresses",
    "CCTP V2 testnet contracts; identical across EVM testnets. Verified bytecode present on Sepolia, Base Sepolia, Arc, Monad.",
  ),
  circleCctpTechnicalGuide: official("https://developers.circle.com/cctp/references/technical-guide"),
  circleUsdcAddresses: official(
    "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    "symbol()/decimals() verified on-chain for every listed testnet",
  ),
  circleForwarding: official("https://developers.circle.com/cctp/concepts/forwarding-service"),
  circleGateway: official("https://developers.circle.com/gateway/references/supported-blockchains"),
  circleFaucet: official("https://faucet.circle.com"),
  arcDocs: official("https://docs.arc.io/integrate/infrastructure/bridges"),
  arcAppKit: official("https://docs.arc.io/app-kit/references/supported-blockchains"),
  ethereumNetworks: official("https://ethereum.org/developers/docs/networks/"),
  baseFunds: official("https://docs.base.org/get-started/get-funds"),
  superchainFaucet: official("https://console.optimism.io/faucet"),
  optimismDocs: official("https://docs.optimism.io"),
  uniswapSepolia: official("https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments"),
  uniswapBase: official("https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments"),
  acrossChains: official("https://docs.across.to/chains-and-contracts"),
  acrossTestnetApi: official("https://testnet.across.to/api", "runtime discovery via /available-routes"),
  lifiChains: official("https://li.quest/v1/chains"),
  lifiIntents: official("https://docs.li.fi/lifi-intents/intents-api/api-overview"),
  layerzeroDeployments: official("https://docs.layerzero.network/v2/deployments/deployed-contracts"),
  layerzeroOft: official("https://docs.layerzero.network/v2/deployments/oft-ecosystem-stargate-assets"),
  wormholeDocs: official("https://wormhole.com/docs/"),
  wormholeFaucets: official("https://wormhole.com/docs/reference/testnet-faucets/"),
  hyperlaneRegistry: official("https://github.com/hyperlane-xyz/hyperlane-registry"),
  monadDevelopers: official("https://monad.xyz/developers"),
  monadFaucet: official("https://faucet.monad.xyz"),
  avalancheDocs: official("https://build.avax.network/docs/primary-network"),
  avalancheFaucet: official("https://build.avax.network/console/primary-network/faucet"),
  polygonRpc: official("https://docs.polygon.technology/pos/reference/rpc-endpoints"),
  polygonFaucet: official("https://faucet.polygon.technology"),
  publicRpcProbe: manual(
    "https://github.com/ethereum-lists/chains",
    "eth_chainId verified against each RPC endpoint on 2026-09-16",
  ),
  wrappedNativeProbe: manual(
    "on-chain eth_call symbol()/decimals()",
    "Wrapped native contracts verified on-chain on 2026-09-16",
  ),
} as const satisfies Record<string, SourceProvenance>;

export type SourceKey = keyof typeof SOURCES;
