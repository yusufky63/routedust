/**
 * Probes Uniswap v2 pairs and v4 pools (ETH/USDC) on the chains the feed lists.
 *   pnpm exec tsx scripts/probe-dex.ts
 */
import { createPublicClient, encodeAbiParameters, formatUnits, http, keccak256, parseAbi, type Address } from "viem";
import { CHAINS, CIRCLE_USDC, findChain } from "@testnet-router/registry";

const v2FactoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
const v2PairAbi = parseAbi(["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"]);
const v2RouterAbi = parseAbi(["function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)"]);
const stateViewAbi = parseAbi(["function getLiquidity(bytes32 poolId) view returns (uint128)", "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)"]);
const v4QuoterAbi = parseAbi([
  "function quoteExactInputSingle((( address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);

const V2: Record<number, { factory: Address; router: Address; weth: Address }> = {
  11155111: { factory: "0xB7f907f7A9eBC822a80BD25E224be42Ce0A698A0", router: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" },
  1301: { factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", router: "0x6e8C9D62A16419357eA998229126D2fD6B1CCfbF", weth: "0x4200000000000000000000000000000000000006" },
};
const V4: Record<number, { stateView: Address; quoter: Address }> = {
  11155111: { stateView: "0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C", quoter: "0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227" },
  84532: { stateView: "0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4", quoter: "0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa" },
  421614: { stateView: "0x9D467FA9062b6e9B1a46E26007aD82db116c67cB", quoter: "0x7dE51022d70A725b508085468052E25e22b5c4c9" },
  1301: { stateView: "0x792d13207744F132943CdDE4D37ec89F20ae3b0D", quoter: "0xB2b34025a07af3925313b6B46f8046Ee8FfBa30B" },
};
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const COMBOS: [number, number][] = [
  [100, 1],
  [500, 10],
  [3000, 60],
  [10000, 200],
];

function poolId(c0: Address, c1: Address, fee: number, tickSpacing: number, hooks: Address) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [c0, c1, fee, tickSpacing, hooks],
    ),
  );
}

async function main() {
  for (const [id, v2] of Object.entries(V2)) {
    const chain = findChain(Number(id))!;
    const client = createPublicClient({ transport: http(chain.rpcUrls[0]) });
    const usdc = CIRCLE_USDC[Number(id)]!;
    const pair = await client.readContract({ address: v2.factory, abi: v2FactoryAbi, functionName: "getPair", args: [v2.weth, usdc] });
    if (pair === ZERO) {
      console.log(`${chain.name} v2: no WETH/USDC pair`);
      continue;
    }
    const [r0, r1] = await client.readContract({ address: pair, abi: v2PairAbi, functionName: "getReserves" });
    const t0 = await client.readContract({ address: pair, abi: v2PairAbi, functionName: "token0" });
    const wethIs0 = t0.toLowerCase() === v2.weth.toLowerCase();
    const rWeth = wethIs0 ? r0 : r1;
    const rUsdc = wethIs0 ? r1 : r0;
    let q = "n/a";
    try {
      const amounts = await client.readContract({ address: v2.router, abi: v2RouterAbi, functionName: "getAmountsOut", args: [10n ** 15n, [v2.weth, usdc]] });
      q = `${formatUnits(amounts[1] ?? 0n, 6)} USDC for 0.001 ETH`;
    } catch (e) {
      q = `quote failed: ${(e as Error).message.split("\n")[0]?.slice(0, 60)}`;
    }
    console.log(`${chain.name} v2: pair ${pair} reserves ${formatUnits(rWeth, 18)} WETH / ${formatUnits(rUsdc, 6)} USDC · ${q}`);
  }

  for (const [id, v4] of Object.entries(V4)) {
    const chain = findChain(Number(id))!;
    const client = createPublicClient({ transport: http(chain.rpcUrls[0]) });
    const usdc = CIRCLE_USDC[Number(id)]!;
    for (const [fee, ts] of COMBOS) {
      const pid = poolId(ZERO, usdc, fee, ts, ZERO);
      try {
        const liq = await client.readContract({ address: v4.stateView, abi: stateViewAbi, functionName: "getLiquidity", args: [pid] });
        if (liq === 0n) continue;
        let q = "n/a";
        try {
          const { result } = await client.simulateContract({
            address: v4.quoter,
            abi: v4QuoterAbi,
            functionName: "quoteExactInputSingle",
            args: [{ poolKey: { currency0: ZERO, currency1: usdc, fee, tickSpacing: ts, hooks: ZERO }, zeroForOne: true, exactAmount: 10n ** 15n, hookData: "0x" }],
          });
          q = `${formatUnits(result[0], 6)} USDC for 0.001 ETH (gas ${result[1]})`;
        } catch (e) {
          q = `quote failed: ${(e as Error).message.split("\n")[0]?.slice(0, 60)}`;
        }
        console.log(`${chain.name} v4: ETH/USDC fee ${fee} ts ${ts} liquidity ${liq} · ${q}`);
      } catch (e) {
        console.log(`${chain.name} v4: stateView error ${(e as Error).message.split("\n")[0]?.slice(0, 60)}`);
        break;
      }
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
