/**
 * Verifies candidate Circle testnets end to end: chainid.network metadata,
 * eth_chainId, Circle USDC symbol/decimals, TokenMessengerV2 bytecode,
 * Multicall3 and a WETH-like 0x4200...0006 predeploy. Prints registry seeds.
 *   pnpm exec tsx scripts/probe-chains.ts
 */
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { CCTP_V2_TESTNET } from "@testnet-router/registry";

const CANDIDATES: { name: string; chainId: number; domain: number; usdc: Address; fast: boolean }[] = [
  { name: "Linea Sepolia", chainId: 59141, domain: 11, usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7", fast: true },
  { name: "Ink Sepolia", chainId: 763373, domain: 21, usdc: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac", fast: true },
  { name: "Sonic Blaze", chainId: 57054, domain: 13, usdc: "0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6", fast: false },
  { name: "Sonic Testnet", chainId: 14601, domain: 13, usdc: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51", fast: false },
  { name: "HyperEVM Testnet", chainId: 998, domain: 19, usdc: "0x2B3370eE501B4a559b57D449569354196457D8Ab", fast: false },
  { name: "Plume Testnet", chainId: 98867, domain: 22, usdc: "0xcB5f30e335672893c7eb944B374c196392C19D18", fast: true },
  { name: "Sei Testnet", chainId: 1328, domain: 16, usdc: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", fast: false },
  { name: "Codex Testnet", chainId: 6513784, domain: 12, usdc: "0x6d7f141b6819C2c9CC2f818e6ad549E7Ca090F8f", fast: true },
  { name: "Cronos Testnet", chainId: 338, domain: 32, usdc: "0xEb33dc5fac03833e132593659e1dE7256aB59794", fast: false },
  { name: "Plasma Testnet", chainId: 9746, domain: 33, usdc: "0xE67Fb267022cBA8064Dd388CC2FED724F3120D9D", fast: false },
  { name: "X Layer Testnet", chainId: 1952, domain: 37, usdc: "0xDec90b78111Ba2fc6FC6d84d8B9ec159A2d4b9B3", fast: true },
  { name: "XDC Apothem", chainId: 51, domain: 18, usdc: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4", fast: false },
  { name: "Injective Testnet", chainId: 1439, domain: 29, usdc: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d", fast: false },
  { name: "Morph Hoodi", chainId: 2810, domain: 30, usdc: "0x7433b41C6c5e1d58D4Da99483609520255ab661B", fast: true },
];

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
const PREDEPLOY_WETH = "0x4200000000000000000000000000000000000006" as Address;

interface ChainidEntry {
  chainId: number;
  name: string;
  nativeCurrency: { symbol: string; decimals: number; name: string };
  rpc: string[];
  faucets: string[];
  explorers?: { url: string }[];
}

async function main() {
  const chainid = (await (await fetch("https://chainid.network/chains.json")).json()) as ChainidEntry[];
  const byId = new Map(chainid.map((c) => [c.chainId, c]));
  const seeds: string[] = [];
  for (const c of CANDIDATES) {
    const meta = byId.get(c.chainId);
    const rpcs = (meta?.rpc ?? []).filter((u) => u.startsWith("https://") && !u.includes("${"));
    if (!meta || rpcs.length === 0) {
      console.log(`${c.name.padEnd(18)} ${String(c.chainId).padStart(8)} no public https RPC on chainid.network`);
      continue;
    }
    let ok = false;
    let detail = "";
    let rpcUsed = "";
    for (const rpc of rpcs.slice(0, 4)) {
      const client = createPublicClient({ transport: http(rpc, { timeout: 12_000, retryCount: 0 }) });
      try {
        const id = await client.getChainId();
        if (id !== c.chainId) {
          detail = `rpc returned chain ${id}`;
          continue;
        }
        const [symbol, decimals, tm, mc, weth] = await Promise.all([
          client.readContract({ address: c.usdc, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
          client.readContract({ address: c.usdc, abi: erc20Abi, functionName: "decimals" }).catch(() => -1),
          client.getCode({ address: CCTP_V2_TESTNET.tokenMessengerV2 }).then((x) => Boolean(x && x !== "0x")),
          client.getCode({ address: MULTICALL3 }).then((x) => Boolean(x && x !== "0x")),
          client.readContract({ address: PREDEPLOY_WETH, abi: erc20Abi, functionName: "symbol" }).catch(() => undefined),
        ]);
        rpcUsed = rpc;
        detail = `usdc=${symbol}/${decimals} tokenMessengerV2=${tm ? "yes" : "NO"} multicall3=${mc ? "yes" : "NO"} predeployWETH=${weth ?? "-"} native=${meta.nativeCurrency.symbol}`;
        ok = symbol === "USDC" && decimals === 6 && tm && mc;
        break;
      } catch (err) {
        detail = (err as Error).message.split("\n")[0]?.slice(0, 70) ?? "error";
      }
    }
    console.log(`${ok ? "OK " : "-- "}${c.name.padEnd(18)} ${String(c.chainId).padStart(8)} d${String(c.domain).padEnd(3)} ${detail} ${rpcUsed ? `rpc=${rpcUsed}` : ""}`);
    if (ok) {
      const explorer = meta.explorers?.[0]?.url ?? "";
      seeds.push(
        JSON.stringify({ name: c.name, chainId: c.chainId, domain: c.domain, usdc: c.usdc, fast: c.fast, native: meta.nativeCurrency.symbol, decimals: meta.nativeCurrency.decimals, rpcs: rpcs.slice(0, 3), explorer, faucets: meta.faucets, chainidName: meta.name }),
      );
    }
  }
  console.log("\nSEEDS");
  for (const s of seeds) console.log(s);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
