import { describe, expect, it } from "vitest";
import { parseUniswapFeed } from "../uniswap/feed";
import { buildCoverage, parseHyperlaneMetadata, type CoverageSourceStatus } from "./index";

const statuses: CoverageSourceStatus[] = [];

describe("coverage aggregation", () => {
  it("parses the Uniswap deployments feed into per-chain contracts", () => {
    const { deployments } = parseUniswapFeed({
      version: "1.0.0",
      records: [
        { protocol: "v3", contract: "UniswapV3Factory", chain: "Monad Testnet", chainId: 10143, address: "0x961235a9020B05C44DF1026D956D1F4D78014276" },
        { protocol: "v3", contract: "QuoterV2", chain: "Monad Testnet", chainId: 10143, address: "0x1b4E313fEF15630AF3e6F2dE550Dbf4cC9D3081d" },
        { protocol: "v3", contract: "SwapRouter02", chain: "Monad Testnet", chainId: 10143, address: "0x4c4eABd5Fb1D1A7234A48692551eAECFF8194CA7" },
        { protocol: "v4", contract: "PoolManager", chain: "Base Sepolia", chainId: 84532, address: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408" },
        { protocol: "v3", contract: "UniswapV3Factory", chain: "Bad", chainId: 1, address: "not-an-address" },
      ],
    });
    expect(deployments.get(10143)?.factory).toBe("0x961235a9020B05C44DF1026D956D1F4D78014276");
    expect(deployments.get(10143)?.swapRouter02).toBeDefined();
    expect(deployments.get(84532)?.v4PoolManager).toBeDefined();
    expect(deployments.get(84532)?.factory).toBeUndefined();
    expect(deployments.has(1)).toBe(false);
  });

  it("parses Hyperlane chain metadata yaml", () => {
    const yaml = `
monadtestnet:
  chainId: 10143
  displayName: Monad Testnet
  isTestnet: true
  protocol: ethereum
  rpcUrls:
    - http: https://testnet-rpc.monad.xyz
ethereum:
  chainId: 1
  displayName: Ethereum
  protocol: ethereum
`;
    const chains = parseHyperlaneMetadata(yaml);
    expect(chains).toHaveLength(2);
    expect(chains[0]).toMatchObject({ name: "monadtestnet", chainId: 10143, displayName: "Monad Testnet", isTestnet: true, protocol: "ethereum" });
    expect(chains[1]?.isTestnet).toBeUndefined();
  });

  it("unions provider testnets, enriches with chainid.network and ranks candidates", () => {
    const report = buildCoverage(
      {
        chainid: [
          { chainId: 10143, name: "Monad Testnet", nativeCurrency: { symbol: "MON", decimals: 18 }, rpc: ["https://testnet-rpc.monad.xyz"], faucets: [] },
          { chainId: 59141, name: "Linea Sepolia", nativeCurrency: { symbol: "ETH", decimals: 18 }, rpc: ["https://rpc.sepolia.linea.build", "wss://rpc.sepolia.linea.build"], faucets: ["https://faucet"] },
          { chainId: 763373, name: "Ink Sepolia", nativeCurrency: { symbol: "ETH", decimals: 18 }, rpc: ["https://rpc-gel-sepolia.inkonchain.com"], faucets: [] },
          { chainId: 1, name: "Ethereum Mainnet", nativeCurrency: { symbol: "ETH", decimals: 18 }, rpc: [], faucets: [] },
        ],
        uniswap: new Map([
          [10143, { chainId: 10143, chainName: "Monad Testnet", factory: "0x1", quoterV2: "0x2", swapRouter02: "0x3" } as never],
          [1, { chainId: 1, chainName: "Ethereum", factory: "0x1", quoterV2: "0x2", swapRouter02: "0x3" } as never],
        ]),
        across: [{ chainId: 37111, name: "Lens Sepolia", spokePool: "0xabc", inputTokens: [{ symbol: "WETH", address: "0x1" }] }],
        lifi: [{ id: 5042002, name: "Arc Testnet" }, { id: 1, name: "Ethereum" }],
        layerzero: [
          { chainKey: "linea-testnet", chainDetails: { nativeChainId: 59141, name: "Linea Sepolia", chainType: "evm", chainStatus: "ACTIVE" }, deployments: [{ version: 2, eid: "40287", endpointV2: { address: "0xe" } }] },
          { chainKey: "private-testnet", chainDetails: { nativeChainId: 99999999, name: "Private", chainType: "evm", chainStatus: "ACTIVE" }, deployments: [{ version: 2, eid: "1", endpointV2: { address: "0xe" } }] },
        ],
        hyperlane: [{ name: "inksepolia", displayName: "Ink Sepolia", chainId: 763373, isTestnet: true, protocol: "ethereum" }],
      },
      statuses,
      { registryChainIds: [10143, 5042002], now: 1 },
    );

    const monad = report.chains.find((c) => c.chainId === 10143);
    expect(monad?.inRegistry).toBe(true);
    expect(monad?.providers.uniswap?.v3).toBe(true);
    expect(monad?.providers.circle?.domain).toBe(15);
    expect(monad?.nativeSymbol).toBe("MON");

    const linea = report.chains.find((c) => c.chainId === 59141);
    expect(linea?.inRegistry).toBe(false);
    expect(linea?.providers.circle?.chainIdConfidence).toBe("verified"); // cross-checked with chainid.network
    expect(linea?.providers.layerzero?.eid).toBe("40287");
    expect(linea?.rpc).toEqual(["https://rpc.sepolia.linea.build"]); // wss + templated urls dropped
    expect(linea?.faucets).toEqual(["https://faucet"]);

    const ink = report.chains.find((c) => c.chainId === 763373);
    expect(ink?.providers.hyperlane?.name).toBe("inksepolia");
    expect(ink?.providers.circle?.domain).toBe(21);

    expect(report.chains.some((c) => c.chainId === 1)).toBe(false); // mainnets excluded
    expect(report.chains.some((c) => c.chainId === 99999999)).toBe(false); // unknown private testnet excluded
    expect(report.chains.find((c) => c.chainId === 37111)?.providers.across?.tokens).toEqual(["WETH"]);
    expect(report.circleUnmapped.some((u) => u.name.startsWith("Solana"))).toBe(true);

    // registry chains first, then by provider count
    expect(report.chains[0]?.inRegistry).toBe(true);
    const candidates = report.chains.filter((c) => !c.inRegistry);
    expect(candidates[0]?.score).toBeGreaterThanOrEqual(candidates[candidates.length - 1]?.score ?? 0);
  });
});
