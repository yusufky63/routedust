/**
 * End-to-end dry run against the live testnets, without a private key:
 * discovery → scan → plan for a wallet, then for the best routes the first
 * hop is BUILT with the real adapters and every transaction is eth_call
 * simulated from that wallet. Reverts are reported with the step they belong
 * to, so an adapter regression shows up before anyone signs.
 *   pnpm e2e 0xWallet [preset] [maxRoutes]
 */
import { createClientResolver, planConsolidation, scanWallet, type Address, type TxStep } from "@testnet-router/core";
import { ASSETS, CHAINS, DESTINATION_PRESETS } from "@testnet-router/registry";
import { createProviders, discoverCapabilities } from "@testnet-router/providers";

async function main() {
  const wallet = process.argv[2] as Address | undefined;
  if (!wallet) throw new Error("usage: pnpm e2e 0xWallet [preset] [maxRoutes]");
  const presetId = process.argv[3] ?? "base-usdc";
  const maxRoutes = Number(process.argv[4] ?? 6);
  const preset = DESTINATION_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown preset ${presetId}`);
  const providers = createProviders();
  const clients = createClientResolver(CHAINS);
  const fetchImpl = globalThis.fetch.bind(globalThis);

  const discovery = await discoverCapabilities(providers, { chains: CHAINS, assets: ASSETS, clients, fetch: fetchImpl, now: Date.now() });
  console.log(`discovery: ${discovery.edges.length} edges, ${discovery.summaries.filter((s) => s.ok).length}/${discovery.summaries.length} providers`);
  const scan = await scanWallet(wallet, CHAINS, ASSETS, clients);
  const plan = await planConsolidation({ wallet, scan, destination: preset.node, mode: "BEST_OUTPUT", graph: discovery.graph, providers, clients, assets: ASSETS, chains: CHAINS, fetch: fetchImpl });
  console.log(`plan: ${plan.stats.routable} routable, ${plan.stats.needGas} need gas, ${plan.stats.noRoute} no route`);

  const routes = plan.sources.filter((s) => s.selected).slice(0, maxRoutes);
  let simulated = 0;
  let reverted = 0;
  for (const s of routes) {
    const c = s.selected!;
    const edge = c.edges[0]!;
    const provider = providers.find((p) => p.key === edge.provider)!;
    console.log(`\n${s.asset.symbol} on chain ${s.sourceChainId} → ${c.edges.map((e) => `${e.type}/${e.provider}`).join(" → ")} (${c.amountOut} out)`);
    let steps;
    try {
      steps = await provider.build(edge, { wallet, recipient: wallet, amountIn: c.amountIn, clients, assets: ASSETS, fetch: fetchImpl, now: Date.now() });
    } catch (err) {
      console.log(`  build failed: ${(err as Error).message.split("\n")[0]}`);
      reverted += 1;
      continue;
    }
    for (const step of steps) {
      if (step.type === "WAIT_ATTESTATION") {
        console.log(`  wait  ${step.label}`);
        continue;
      }
      if (step.type === "PERMIT") {
        console.log(`  sign  ${step.label}`);
        continue;
      }
      const tx = (step as TxStep).tx;
      const client = clients.get(tx.chainId);
      try {
        await client.call({ account: wallet, to: tx.to, data: tx.data, value: tx.value });
        simulated += 1;
        console.log(`  ok    ${step.label}${step.summary ? ` · ${step.summary.slice(0, 90)}` : ""}`);
      } catch (err) {
        const msg = (err as Error).message.split("\n")[0]?.slice(0, 120) ?? "revert";
        // A swap/bridge right after a pending approval reverts on allowance: expected in a dry run.
        const afterApproval = steps.some((x) => x.type === "APPROVE") && step.type !== "APPROVE" && /allowance|transfer amount exceeds|STF|TRANSFER_FROM_FAILED/i.test(msg);
        if (afterApproval) console.log(`  skip  ${step.label} · needs the approval above first (${msg})`);
        else {
          reverted += 1;
          console.log(`  FAIL  ${step.label} · ${msg}`);
        }
      }
    }
  }
  console.log(`\nsimulated ${simulated} transactions, ${reverted} unexpected failures`);
  if (reverted > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
