import { describe, expect, it } from "vitest";
import {
  ASSETS,
  CCTP_DOMAINS,
  CHAINS,
  CHAIN_IDS,
  DESTINATION_PRESETS,
  FAUCETS,
  UNISWAP_V3_DEPLOYMENTS,
  assetsForChain,
  faucetsForChain,
  nativeAsset,
  usdcAsset,
  wrappedNative,
} from "./index";

describe("chain registry", () => {
  it("has unique chain ids and keys", () => {
    const ids = new Set(CHAINS.map((c) => c.id));
    const keys = new Set(CHAINS.map((c) => c.key));
    expect(ids.size).toBe(CHAINS.length);
    expect(keys.size).toBe(CHAINS.length);
    expect(CHAINS.length).toBeGreaterThanOrEqual(8);
  });

  it("registers GIWA Sepolia as an OP Stack chain with a canonical bridge and token indexer", () => {
    const giwa = CHAINS.find((c) => c.id === CHAIN_IDS.GIWA_SEPOLIA);
    expect(giwa?.opStack?.l1ChainId).toBe(CHAIN_IDS.ETHEREUM_SEPOLIA);
    expect(giwa?.opStack?.l1StandardBridge).toBe("0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7");
    expect(giwa?.tokenIndexer?.kind).toBe("blockscout");
    expect(giwa?.cctpDomain).toBeUndefined();
    expect(faucetsForChain(CHAIN_IDS.GIWA_SEPOLIA).some((f) => f.source === "CHAIN_OFFICIAL")).toBe(true);
  });

  it("marks every chain as testnet with provenance and at least one faucet", () => {
    for (const chain of CHAINS) {
      expect(chain.testnet).toBe(true);
      expect(chain.source.url).toMatch(/^https?:\/\//);
      expect(chain.source.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(chain.rpcUrls.length).toBeGreaterThan(0);
      expect(faucetsForChain(chain.id).length, `${chain.name} faucets`).toBeGreaterThan(0);
    }
  });

  it("treats native as a role, not ETH", () => {
    const symbols = new Map(CHAINS.map((c) => [c.id, c.nativeAsset.symbol]));
    expect(symbols.get(CHAIN_IDS.MONAD_TESTNET)).toBe("MON");
    expect(symbols.get(CHAIN_IDS.AVALANCHE_FUJI)).toBe("AVAX");
    expect(symbols.get(CHAIN_IDS.POLYGON_AMOY)).toBe("POL");
    expect(symbols.get(CHAIN_IDS.ARC_TESTNET)).toBe("USDC");
    expect(symbols.get(CHAIN_IDS.ETHEREUM_SEPOLIA)).toBe("ETH");
  });

  it("normalises Arc native 18 decimals vs ERC-20 mirror 6 decimals", () => {
    const arc = CHAINS.find((c) => c.id === CHAIN_IDS.ARC_TESTNET);
    expect(arc?.nativeAsset.decimals).toBe(18);
    expect(arc?.nativeAsset.erc20Mirror?.decimals).toBe(6);
    expect(arc?.nativeAsset.erc20Mirror?.address).toBe("0x3600000000000000000000000000000000000000");
    // Arc USDC is the native asset, not a separate ERC-20 asset.
    const arcAssets = assetsForChain(CHAIN_IDS.ARC_TESTNET);
    expect(arcAssets.filter((a) => a.canonicalAssetId === "USDC")).toHaveLength(1);
    expect(usdcAsset(CHAIN_IDS.ARC_TESTNET)?.kind).toBe("NATIVE");
  });

  it("does not expose Arc faucet for ETH", () => {
    const arcFaucets = faucetsForChain(CHAIN_IDS.ARC_TESTNET);
    expect(arcFaucets.some((f) => f.assetId === "ETH")).toBe(false);
    expect(arcFaucets.some((f) => f.assetId === "USDC")).toBe(true);
  });
});

describe("asset registry", () => {
  it("keys assets by chain + address, never by symbol", () => {
    const ids = new Set(ASSETS.map((a) => a.id));
    expect(ids.size).toBe(ASSETS.length);
    const usdcs = ASSETS.filter((a) => a.symbol === "USDC");
    expect(usdcs.length).toBeGreaterThan(5);
    expect(new Set(usdcs.map((a) => a.id)).size).toBe(usdcs.length);
  });

  it("registers Circle USDC as CIRCLE_NATIVE with 6 decimals on every CCTP chain", () => {
    for (const chain of CHAINS) {
      const usdc = usdcAsset(chain.id);
      if (chain.cctpDomain === undefined) {
        expect(usdc, `${chain.name} has no Circle USDC`).toBeUndefined();
        continue;
      }
      expect(usdc, `${chain.name} usdc`).toBeDefined();
      if (chain.id === CHAIN_IDS.ARC_TESTNET) continue;
      expect(usdc?.representation).toBe("CIRCLE_NATIVE");
      expect(usdc?.decimals).toBe(6);
      expect(usdc?.issuer).toBe("Circle");
    }
  });

  it("only registers wrapped natives that were verified on-chain", () => {
    for (const chain of CHAINS) {
      const w = wrappedNative(chain.id);
      if (chain.nativeAsset.wrappedVerified) {
        expect(w?.address?.toLowerCase()).toBe(chain.nativeAsset.wrappedAddress?.toLowerCase());
        expect(w?.representation).toBe("WRAPPED_NATIVE");
      } else {
        expect(w).toBeUndefined();
      }
    }
    expect(wrappedNative(CHAIN_IDS.MONAD_TESTNET)).toBeUndefined();
  });

  it("exposes native assets with the chain decimals", () => {
    expect(nativeAsset(CHAIN_IDS.ARC_TESTNET).decimals).toBe(18);
    expect(nativeAsset(CHAIN_IDS.MONAD_TESTNET).symbol).toBe("MON");
  });

  it("has destination presets that resolve to registered assets", () => {
    for (const preset of DESTINATION_PRESETS) {
      expect(ASSETS.some((a) => a.id === preset.node.assetId)).toBe(true);
    }
  });
});

describe("cctp registry", () => {
  it("maps each chain to a unique Circle domain", () => {
    const domains = new Set(CCTP_DOMAINS.map((d) => d.domain));
    expect(domains.size).toBe(CCTP_DOMAINS.length);
    for (const d of CCTP_DOMAINS) {
      const chain = CHAINS.find((c) => c.id === d.chainId);
      expect(chain?.cctpDomain).toBe(d.domain);
    }
  });

  it("pins the well-known domains from the spec", () => {
    const byChain = new Map(CCTP_DOMAINS.map((d) => [d.chainId, d.domain]));
    expect(byChain.get(CHAIN_IDS.ETHEREUM_SEPOLIA)).toBe(0);
    expect(byChain.get(CHAIN_IDS.BASE_SEPOLIA)).toBe(6);
    expect(byChain.get(CHAIN_IDS.ARC_TESTNET)).toBe(26);
    expect(byChain.get(CHAIN_IDS.MONAD_TESTNET)).toBe(15);
    expect(byChain.get(CHAIN_IDS.AVALANCHE_FUJI)).toBe(1);
  });
});

describe("dex + faucet registries", () => {
  it("only lists DEX deployments for chains in the registry", () => {
    for (const d of UNISWAP_V3_DEPLOYMENTS) {
      expect(CHAINS.some((c) => c.id === d.chainId)).toBe(true);
      expect(d.source.url).toMatch(/uniswap/);
    }
  });

  it("labels every faucet with a provenance class and verification date", () => {
    for (const f of FAUCETS) {
      expect(["CHAIN_OFFICIAL", "PROTOCOL_OFFICIAL", "THIRD_PARTY"]).toContain(f.source);
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.lastVerifiedAt).toBeTruthy();
    }
  });
});
