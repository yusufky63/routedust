import type { SourceProvenance } from "@testnet-router/core";

/** Research snapshot date of the spec + on-chain verification performed for this registry. */
export const REGISTRY_VERIFIED_AT = "2026-09-17T01:35:01Z";

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
  circleEurc: official("https://developers.circle.com/stablecoins/eurc-contract-addresses", "symbol()/decimals() verified on-chain (scripts/probe-tokens.ts)"),
  chainlinkTokens: official("https://docs.chain.link/resources/link-token-contracts", "test LINK; symbol()/decimals() verified on-chain (scripts/probe-tokens.ts)"),
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
  acrossContracts: official(
    "https://docs.across.to/reference/contract-addresses",
    "testnet SpokePools; wrappedNativeToken() matches each chain's WETH and numberOfDeposits() answers (2026-09-29). Docs: relayer settlement does not occur on testnet and unfilled deposits are not automatically refunded",
  ),
  lifiChains: official("https://li.quest/v1/chains"),
  lifiIntents: official("https://docs.li.fi/lifi-intents/intents-api/api-overview"),
  layerzeroDeployments: official("https://docs.layerzero.network/v2/deployments/deployed-contracts"),
  layerzeroOft: official("https://docs.layerzero.network/v2/deployments/oft-ecosystem-stargate-assets"),
  wormholeDocs: official("https://wormhole.com/docs/"),
  wormholeFaucets: official("https://wormhole.com/docs/reference/testnet-faucets/"),
  hyperlaneRegistry: official("https://github.com/hyperlane-xyz/hyperlane-registry"),
  monadDevelopers: official("https://monad.xyz/developers"),
  giwaDocs: official("https://docs.giwa.io/network-information/contracts", "GIWA Sepolia: OP Stack L2 on Ethereum Sepolia; chain id 91342 verified via eth_chainId"),
  monadFaucet: official("https://faucet.monad.xyz"),
  uniswapFeed: official("https://developers.uniswap.org/deployments.json", "unified deployments feed: v2/v3/v4, Universal Router, Permit2 per chain"),
  stargateTestnet: official("https://github.com/stargate-protocol/stargate-v2/tree/main/packages/stg-evm-v2/deployments", "StargatePoolNative addresses from the V2 deployments; token() == 0x0 and paths(dstEid).credit verified on-chain"),
  layerzeroScan: official("https://docs.layerzero.network/v2/tools/layerzeroscan/api", "message delivery status per source tx hash"),
  pangolinDocs: official("https://docs.pangolin.exchange/developers/contracts-and-integration-reference/avalanche-v2", "Pangolin v2 testnet factory/router; router.factory() and WAVAX() verified on Fuji"),
  pangolinSdk: official("https://github.com/pangolindex/sdk/blob/master/src/chains.ts", "Pangolin SDK AVALANCHE_FUJI factory/router; router.factory() and WAVAX() verified on Fuji"),
  lfjDocs: official("https://developers.lfj.gg/deployment-addresses/fuji", "LFJ (Trader Joe) V1 factory/router on Fuji; router.factory() and WAVAX() verified on-chain"),
  lineaDocs: official("https://docs.linea.build/get-started/build/network-info", "Linea Sepolia: chain id 59141 and WETH verified on-chain"),
  unichainRegistry: official(
    "https://github.com/ethereum-optimism/superchain-registry/blob/main/superchain/configs/sepolia/unichain.toml",
    "Unichain Sepolia L1StandardBridgeProxy (also in viem's unichainSepolia); bytecode, version() 2.8.2, paused() false and a bridgeETHTo eth_call verified on Sepolia 2026-09-29",
  ),
  worldchainDocs: official(
    "https://docs.world.org/world-chain/developers/world-chain-contracts",
    "World Chain Sepolia L1StandardBridge, same as the superchain-registry and viem; bytecode, version() 2.8.2, paused() false and a bridgeETHTo eth_call verified on Sepolia 2026-09-29",
  ),
  inkDocs: official("https://docs.inkonchain.com/useful-information/contracts", "Ink Sepolia: OP Stack L2 on Ethereum Sepolia; chain id 763373, WETH predeploy and L1StandardBridge bytecode verified"),
  sonicDocs: official("https://docs.soniclabs.com/sonic/build-on-sonic/getting-started", "Sonic Testnet: chain id 14601 and wS verified on-chain"),
  plumeDocs: official("https://docs.plume.org", "Plume Testnet: chain id 98867 verified on-chain"),
  seiDocs: official("https://docs.sei.io/evm/networks", "Sei Testnet (atlantic-2): chain id 1328 and WSEI verified on-chain"),
  cronosDocs: official("https://docs.cronos.org/for-users/metamask", "Cronos Testnet: chain id 338 and WCRO verified on-chain"),
  plasmaDocs: official("https://docs.plasma.to", "Plasma Testnet: chain id 9746 verified on-chain"),
  xlayerDocs: official("https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/quickstart", "X Layer Testnet: chain id 1952 and WOKB predeploy verified on-chain"),
  injectiveDocs: official("https://docs.injective.network/developers-evm/network-information", "Injective EVM Testnet: chain id 1439 and WINJ verified on-chain"),
  avalancheDocs: official("https://build.avax.network/docs/primary-network"),
  avalancheFaucet: official("https://build.avax.network/console/primary-network/faucet"),
  polygonRpc: official("https://docs.polygon.technology/pos/reference/rpc-endpoints"),
  polygonFaucet: official("https://faucet.polygon.technology"),
  baseBridges: official("https://docs.base.org/base-chain/network-information/ecosystem-bridges", "Base lists third-party bridges only (bridge.base.org is retired); Superbridge's testnet site preselects ?fromChainId=&toChainId= (checked in a browser 2026-09-29)"),
  optimismWithdrawals: official("https://docs.optimism.io/op-stack/bridging/withdrawal-flow", "withdrawals: 7 days on mainnet, shorter on test networks; app.optimism.io/bridge is retired"),
  unichainBridges: official("https://developers.uniswap.org/docs/unichain/tools/bridges", "Unichain lists Superbridge, Brid.gg and thirdweb; only testnets.superbridge.app preselects Unichain Sepolia (checked 2026-09-29)"),
  worldchainBridges: official("https://docs.world.org/world-chain/providers/bridges", "testnet bridge worldchain-sepolia.bridge.alchemy.com (Alchemy, World Chain's rollup provider); no chain params in the URL"),
  inkBridges: official("https://docs.inkonchain.com/tools/bridges", "Ink lists Superbridge; its own inkonchain.com/bridge now shows mainnet only"),
  giwaBridges: official("https://docs.giwa.io/giwa-chain/en/tools/bridges", "sepolia-bridge.giwa.io (Superbridge white-label); ?fromChainId=&toChainId= preselects the pair; withdrawals wait around 7 days"),
  arbitrumBridge: official("https://docs.arbitrum.io/arbitrum-bridge/quickstart", "portal.arbitrum.io/bridge?sourceChain=&destinationChain= (slugs sepolia, arbitrum-sepolia, plume-testnet) checked in a browser 2026-09-29; testnets appear once the wallet is on Sepolia"),
  lineaBridge: official("https://docs.linea.build/network/how-to/bridge", "\"Testnet bridging is only possible on the native bridge\"; testnets behind the Show Test Networks switch, no chain params"),
  polygonPortal: official("https://docs.polygon.technology/pos/how-to/bridging/ethereum-polygon/portal-ui", "Portal bridge: \"available for both the PoS Amoy testnet and mainnet\"; testnet is an in-app switch, no chain params in the URL"),
  plumeBridges: official("https://docs.plume.org/plume/developers/tools-and-services/bridges", "links bridge.arbitrum.io/?destinationChain=plume-testnet&sourceChain=sepolia&tab=bridge for the testnet"),
  injectiveHub: official("https://testnet.hub.injective.network/bridge/", "the testnet Hub's Bridge page forwards to testnet.bridge.injective.network (Peggy, Ethereum Sepolia ↔ injective-888); docs list only the mainnet bridge"),
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
