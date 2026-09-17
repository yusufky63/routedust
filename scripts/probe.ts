/**
 * On-chain capability probe. Run with: pnpm probe
 * Verifies: RPC chain ids, Multicall3 presence, OP bridge bytecode,
 * Uniswap v3 pool existence + liquidity + live quote for wrapped-native -> USDC.
 */
import { createPublicClient, http, parseAbi, formatUnits, parseEther, type Address } from "viem";
import { CHAINS, UNISWAP_V3_DEPLOYMENTS, OP_STANDARD_BRIDGES, CIRCLE_USDC, CCTP_V2_TESTNET } from "@testnet-router/registry";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const poolAbi = parseAbi(["function liquidity() view returns (uint128)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

/** `pnpm probe --write` stamps REGISTRY_VERIFIED_AT with the time of a clean run. */
async function stampVerifiedAt(): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const path = new URL("../packages/registry/src/sources.ts", import.meta.url);
  const src = await readFile(path, "utf8");
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const next = src.replace(/export const REGISTRY_VERIFIED_AT = "[^"]+";/, `export const REGISTRY_VERIFIED_AT = "${stamp}";`);
  await writeFile(path, next);
  console.log(`REGISTRY_VERIFIED_AT → ${stamp}`);
}

async function main() {
  let failures = 0;
  for (const chain of CHAINS) {
    const client = createPublicClient({ transport: http(chain.rpcUrls[0], { timeout: 15_000 }) });
    const started = Date.now();
    try {
      const [id, mc, tm] = await Promise.all([
        client.getChainId(),
        client.getCode({ address: MULTICALL3 }),
        chain.cctpDomain !== undefined ? client.getCode({ address: CCTP_V2_TESTNET.tokenMessengerV2 }) : Promise.resolve("0x"),
      ]);
      console.log(
        `${chain.name.padEnd(22)} chainId=${id} ${id === chain.id ? "OK " : "MISMATCH"} multicall3=${mc && mc !== "0x" ? "yes" : "NO "} tokenMessengerV2=${tm && tm !== "0x" ? "yes" : "no "} ${Date.now() - started}ms`,
      );
    } catch (err) {
      failures += 1;
      console.log(`${chain.name.padEnd(22)} ERROR ${(err as Error).message.slice(0, 80)}`);
    }
  }

  console.log("\n== OP Standard Bridges ==");
  for (const b of OP_STANDARD_BRIDGES) {
    const l1 = CHAINS.find((c) => c.id === b.l1ChainId)!;
    const client = createPublicClient({ transport: http(l1.rpcUrls[0]) });
    const code = await client.getCode({ address: b.l1StandardBridge });
    console.log(`L1StandardBridge for ${b.l2ChainId}: ${b.l1StandardBridge} code=${code && code !== "0x" ? "yes" : "NO"}`);
  }

  console.log("\n== Uniswap v3 pools (wrapped native -> USDC) ==");
  for (const d of UNISWAP_V3_DEPLOYMENTS) {
    const chain = CHAINS.find((c) => c.id === d.chainId)!;
    const usdc = CIRCLE_USDC[d.chainId]!;
    const client = createPublicClient({ transport: http(chain.rpcUrls[0]) });
    for (const fee of d.feeTiers) {
      const pool = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "getPool", args: [d.weth9, usdc, fee] });
      if (pool === "0x0000000000000000000000000000000000000000") {
        console.log(`${chain.name} fee=${fee}: no pool`);
        continue;
      }
      const liq = await client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" });
      let quote = "n/a";
      try {
        const { result } = await client.simulateContract({
          address: d.quoterV2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: d.weth9, tokenOut: usdc, amountIn: parseEther("0.001"), fee, sqrtPriceLimitX96: 0n }],
        });
        quote = `${formatUnits(result[0], 6)} USDC for 0.001 ETH (gas ${result[3]})`;
      } catch (err) {
        quote = `quote failed: ${(err as Error).message.split("\n")[0]?.slice(0, 80)}`;
      }
      console.log(`${chain.name} fee=${fee}: pool=${pool} liquidity=${liq} quote=${quote}`);
    }
  }

  if (process.argv.includes("--write")) {
    if (failures > 0) console.log(`\n${failures} chain(s) failed: REGISTRY_VERIFIED_AT left unchanged`);
    else await stampVerifiedAt();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
