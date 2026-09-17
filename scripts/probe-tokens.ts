/**
 * Verifies candidate known test tokens (symbol/decimals/name on-chain) before
 * they are listed in packages/registry/src/tokens.ts.
 *   pnpm exec tsx scripts/probe-tokens.ts
 */
import { erc20Abi, type Address } from "viem";
import { createClientResolver } from "@testnet-router/core";
import { CHAINS, CHAIN_IDS, findChain } from "@testnet-router/registry";

const CANDIDATES: { symbol: string; chainId: number; address: Address }[] = [
  { symbol: "EURC", chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4" },
  { symbol: "EURC", chainId: CHAIN_IDS.BASE_SEPOLIA, address: "0x808456652fdb597867f38412077A9182bf77359F" },
  { symbol: "EURC", chainId: CHAIN_IDS.AVALANCHE_FUJI, address: "0x5E44db7996c682E92a960b65AC713a54AD815c6B" },
  { symbol: "LINK", chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, address: "0x779877A7B0D9E8603169DdbD7836e478b4624789" },
  { symbol: "LINK", chainId: CHAIN_IDS.BASE_SEPOLIA, address: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" },
  { symbol: "LINK", chainId: CHAIN_IDS.ARBITRUM_SEPOLIA, address: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E" },
  { symbol: "LINK", chainId: CHAIN_IDS.OP_SEPOLIA, address: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" },
  { symbol: "LINK", chainId: CHAIN_IDS.AVALANCHE_FUJI, address: "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846" },
  { symbol: "LINK", chainId: CHAIN_IDS.POLYGON_AMOY, address: "0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904" },
];

const clients = createClientResolver(CHAINS);

async function main() {
  for (const c of CANDIDATES) {
    const client = clients.get(c.chainId);
    try {
      const [symbol, decimals, name] = await Promise.all([
        client.readContract({ address: c.address, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: c.address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: c.address, abi: erc20Abi, functionName: "name" }),
      ]);
      const ok = symbol.toUpperCase() === c.symbol;
      console.log(`${ok ? "OK " : "-- "}${c.symbol.padEnd(5)} ${findChain(c.chainId)?.shortName?.padEnd(9)} ${c.address} symbol=${symbol} decimals=${decimals} name="${name}"`);
    } catch (err) {
      console.log(`ERR ${c.symbol.padEnd(5)} ${findChain(c.chainId)?.shortName?.padEnd(9)} ${c.address} ${(err as Error).message.split("\n")[0]?.slice(0, 80)}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
