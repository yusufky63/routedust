/**
 * Live capability discovery + optional wallet plan.
 *   pnpm discover                      -> discover edges only
 *   pnpm discover 0xWallet [preset]    -> scan wallet and plan (preset: base-usdc | sepolia-eth | arc-usdc)
 */
import "./env";
import {
  checkTransferSanity,
  createClientResolver,
  discoverWalletTokens,
  formatAmount,
  planConsolidation,
  scanWallet,
  type Address,
  type RouteMode,
} from "@testnet-router/core";
import { ASSETS, CHAINS, DESTINATION_PRESETS, findAsset, findChain } from "@testnet-router/registry";
import { createProviders, discoverCapabilities, withLifiIntegration } from "@testnet-router/providers";

async function main() {
  const wallet = process.argv[2] as Address | undefined;
  const presetId = process.argv[3] ?? "base-usdc";
  const mode = (process.argv[4] ?? "BEST_OUTPUT") as RouteMode;
  const clients = createClientResolver(CHAINS);
  const providers = createProviders();

  // Wallet-held ERC-20s outside the registry (unverified; only sellable through a DEX).
  let assets = ASSETS;
  if (wallet) {
    console.time("tokens");
    const tokens = await discoverWalletTokens(wallet, CHAINS, ASSETS, clients, globalThis.fetch);
    console.timeEnd("tokens");
    for (const c of tokens.chains) {
      console.log(`${(findChain(c.chainId)?.name ?? String(c.chainId)).padEnd(22)} ${c.ok ? `${c.indexed} indexed, ${c.kept} verified with balance` : `ERROR ${c.error}`}`);
    }
    assets = [...ASSETS, ...tokens.assets];
  }

  console.time("discover");
  const discovery = await discoverCapabilities(providers, {
    chains: CHAINS,
    assets,
    clients,
    fetch: withLifiIntegration(globalThis.fetch.bind(globalThis)),
    now: Date.now(),
  });
  console.timeEnd("discover");
  for (const s of discovery.summaries) {
    console.log(`${s.ok ? "OK " : "ERR"} ${s.name.padEnd(22)} edges=${String(s.edges).padStart(3)} chains=${s.chains.length} ${s.error ?? ""}`);
  }
  console.log(`graph: ${discovery.graph.size} edges, ${discovery.graph.nodeList().length} nodes`);

  if (!wallet) return;

  // Same policy as the web app: unverified tokens survive only if a live DEX pool can sell them.
  const sellable = new Set(discovery.edges.filter((e) => e.type === "SWAP").map((e) => e.from.assetId));
  const before = assets.length;
  const survivors = assets.filter((a) => !a.verified && sellable.has(a.id));
  const checked = await Promise.all(
    survivors.map(async (a) => ({ ...a, risk: await checkTransferSanity(clients.get(a.chainId), a.address as Address, a.decimals) })),
  );
  for (const a of checked) console.log(`  ${a.symbol.padEnd(10)} ${findChain(a.chainId)?.shortName?.padEnd(9)} transfer=${a.risk?.transfer}${a.risk?.detail ? ` (${a.risk.detail})` : ""}`);
  assets = [...assets.filter((a) => a.verified), ...checked.filter((a) => a.risk?.transfer !== "blocked" && a.risk?.transfer !== "fee")];
  console.log(`unverified tokens kept: ${assets.filter((a) => !a.verified).length} sellable of ${before - ASSETS.length} discovered`);

  const preset = DESTINATION_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown preset ${presetId}`);

  console.time("scan");
  const scan = await scanWallet(wallet, CHAINS, assets, clients);
  console.timeEnd("scan");
  for (const c of scan.chains) {
    const chain = findChain(c.chainId);
    const line = c.balances.filter((b) => b.raw > 0n).map((b) => `${b.formatted} ${b.asset.symbol}`).join(", ");
    console.log(`${(chain?.name ?? String(c.chainId)).padEnd(22)} ${c.ok ? line || "-" : `ERROR ${c.error}`}`);
  }

  console.time("plan");
  const plan = await planConsolidation({
    wallet,
    scan,
    destination: preset.node,
    mode,
    graph: discovery.graph,
    providers,
    clients,
    assets,
    chains: CHAINS,
    onProgress: (p) => console.log(`  [${p.phase}] ${p.message}`),
  });
  console.timeEnd("plan");

  const dest = findAsset(preset.node.assetId);
  console.log(`\nTARGET ${findChain(preset.node.chainId)?.name} / ${dest?.symbol}   MODE ${mode}`);
  console.log(JSON.stringify(plan.stats));
  for (const s of plan.sources) {
    const chain = findChain(s.sourceChainId);
    console.log(`\n${chain?.name} ${formatAmount(s.balance, s.asset.decimals)} ${s.asset.symbol}  ->  ${s.status}${s.reason ? ` (${s.reason})` : ""}`);
    if (s.gas.reserve > 0n) console.log(`  gas reserve ${formatAmount(s.gas.reserve, 18)} ${chain?.nativeAsset.symbol}, shortfall ${formatAmount(s.gas.shortfall, 18)}`);
    for (const c of s.candidates) {
      const path = c.edges.map((e) => `${e.type}/${e.provider}`).join(" -> ");
      console.log(`  ${c === s.selected ? "*" : " "} ${formatAmount(c.amountOut, dest?.decimals ?? 6)} ${dest?.symbol}  ${path}  tx=${c.txCount} ~${c.estimatedSeconds}s ${c.outputCanonicality} score=${c.score?.toFixed(3)}${c.excludedBy ? ` EXCLUDED:${c.excludedBy}` : ""}`);
    }
    for (const n of s.notes) console.log(`    note: ${n}`);
    if (s.status === "NEED_GAS") for (const f of s.faucets) console.log(`    faucet: ${f.name} ${f.url}`);
  }
  for (const g of plan.groups ?? []) {
    const chain = findChain(g.chainId);
    console.log(`\nPOOLED BRIDGE on ${chain?.name}: ${g.legs.length} balances → ${g.bridge.edges.map((e) => `${e.type}/${e.provider}`).join(" → ")}`);
    for (const leg of g.legs) {
      const src = plan.sources.find((s) => s.id === leg.sourceId);
      console.log(`  ${src ? `${formatAmount(leg.candidate?.amountIn ?? leg.hubAmount, src.asset.decimals)} ${src.asset.symbol}` : leg.sourceId} ${leg.candidate ? `via ${leg.candidate.edges.map((e) => `${e.type}/${e.provider}`).join(" → ")}` : "(hub asset)"} → ${leg.hubAmount} hub units`);
    }
    console.log(`  bridge ${formatAmount(g.bridge.amountIn, plan.sources.find((s) => s.id === g.hub.assetId)?.asset.decimals ?? 6)} pooled → ${formatAmount(g.expectedOut, dest?.decimals ?? 6)} ${dest?.symbol} in ${g.txCount} tx (separately ${formatAmount(g.separateOut, dest?.decimals ?? 6)} in ${g.separateTxCount} tx)${g.gasShortfall ? ` · needs ${formatAmount(g.gasShortfall, 18)} more gas` : ""}`);
  }
  console.log(`\nTOTAL OUT ${formatAmount(plan.totalOut, dest?.decimals ?? 6)} ${dest?.symbol}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
