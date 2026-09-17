/**
 * Prints keccak256(bytecode) for every spender / router contract the wallet is
 * asked to sign against, as TypeScript entries for
 * packages/registry/src/codehash.ts. Re-run after a registry change:
 *   pnpm exec tsx scripts/codehash.ts
 */
import { keccak256, type Address } from "viem";
import { createClientResolver } from "@testnet-router/core";
import { CCTP_DOMAINS, CCTP_V2_TESTNET, CHAINS, HYPERLANE_WARP_ROUTES, OP_STANDARD_BRIDGES, UNISWAP_V3_DEPLOYMENTS, V2_AMM_DEPLOYMENTS, findChain } from "@testnet-router/registry";

const clients = createClientResolver(CHAINS);

async function main() {
  const targets: { chainId: number; address: Address; label: string }[] = [];
  for (const d of CCTP_DOMAINS) {
    targets.push({ chainId: d.chainId, address: CCTP_V2_TESTNET.tokenMessengerV2, label: "TokenMessengerV2" });
    targets.push({ chainId: d.chainId, address: CCTP_V2_TESTNET.messageTransmitterV2, label: "MessageTransmitterV2" });
  }
  for (const d of UNISWAP_V3_DEPLOYMENTS) {
    targets.push({ chainId: d.chainId, address: d.swapRouter02, label: "SwapRouter02" });
    targets.push({ chainId: d.chainId, address: d.universalRouter, label: "UniversalRouter" });
    targets.push({ chainId: d.chainId, address: d.permit2, label: "Permit2" });
  }
  for (const d of V2_AMM_DEPLOYMENTS) targets.push({ chainId: d.chainId, address: d.router, label: `${d.name} router` });
  for (const r of HYPERLANE_WARP_ROUTES) for (const t of r.tokens) targets.push({ chainId: t.chainId, address: t.router, label: `Hyperlane ${r.id}` });
  for (const b of OP_STANDARD_BRIDGES) targets.push({ chainId: b.l1ChainId, address: b.l1StandardBridge, label: `L1StandardBridge → ${findChain(b.l2ChainId)?.shortName}` });

  const lines: string[] = [];
  for (const t of targets) {
    try {
      const code = await clients.get(t.chainId).getCode({ address: t.address });
      if (!code || code === "0x") {
        console.error(`no code: ${t.label} ${t.address} on ${t.chainId}`);
        continue;
      }
      lines.push(`  "${t.chainId}:${t.address.toLowerCase()}": "${keccak256(code)}", // ${t.label} · ${findChain(t.chainId)?.shortName}`);
    } catch (err) {
      console.error(`error: ${t.label} on ${t.chainId}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
