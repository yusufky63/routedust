/**
 * REAL, SIGNED end-to-end run through the production executor. Spends testnet
 * funds from FAUCET_PRIVATE_KEY (repo-root .env, never printed).
 *
 *   pnpm live <preset|chainId:SYMBOL> <chainId:SYMBOL> <amount> [--cap 0.05] [--minutes 30]
 *   pnpm live base-usdc 11155111:ETH 0.002
 *   pnpm live 11155111:USDC 84532:USDC 20      # any registry asset as the target
 *   pnpm live --gateway 84532:USDC             # pooled Circle Gateway set for the whole plan
 *
 * It discovers, plans for the wallet, takes the planner's selected route for
 * that source, sets the amount and runs it: every transaction is simulated,
 * gas-budgeted, code-pinned and signed exactly as in the web app. Nothing is
 * signed above --cap (default 0.05 native units).
 */
import "./env";
import { createWalletClient, formatUnits, http, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  RouteExecutor,
  createClientResolver,
  createExecution,
  nodeFromAsset,
  planConsolidation,
  scanWallet,
  toViemChain,
  type Address,
  type AssetNode,
  type RouteCandidate,
  type RouteExecution,
  type Signer,
  type SourcePlan,
} from "@testnet-router/core";
import { ASSETS, CHAINS, DESTINATION_PRESETS, findChain } from "@testnet-router/registry";
import { createProviders, discoverCapabilities, gatewaySetCandidates, offerGatewaySet, planGatewaySet, withLifiIntegration } from "@testnet-router/providers";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/** Values that belong to a --flag, so they are not read as positional arguments. */
function isFlagValue(value: string): boolean {
  const i = process.argv.indexOf(value);
  return i > 2 && (process.argv[i - 1] === "--cap" || process.argv[i - 1] === "--minutes");
}

/** A preset id, or "11155111:USDC" for any registry asset. */
function resolveTarget(ref: string): { node: AssetNode; label: string } {
  const preset = DESTINATION_PRESETS.find((p) => p.id === ref);
  if (preset) return { node: preset.node, label: preset.label };
  const [chainPart, symbol] = ref.split(":");
  const asset = ASSETS.find((a) => a.chainId === Number(chainPart) && a.symbol.toUpperCase() === (symbol ?? "").toUpperCase());
  if (!asset) throw new Error(`unknown target ${ref}: use a preset (${DESTINATION_PRESETS.map((p) => p.id).join(", ")}) or chainId:SYMBOL`);
  return { node: nodeFromAsset(asset), label: `${asset.symbol} on ${findChain(asset.chainId)?.shortName}` };
}

const gatewayMode = process.argv.includes("--gateway");
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--") && !isFlagValue(a));
const targetRef = positional[0];
const sourceRef = positional[1];
const amountHuman = positional[2];
const cap = Number(arg("cap", "0.05"));
const minutes = Number(arg("minutes", "30"));
if (!targetRef || (!gatewayMode && (!sourceRef || !amountHuman))) {
  throw new Error("usage: pnpm live <preset|chainId:SYMBOL> <chainId:SYMBOL> <amount> [--cap x] [--minutes n]  |  pnpm live --gateway <chainId:SYMBOL>");
}

const key = process.env.FAUCET_PRIVATE_KEY?.trim();
if (!key) throw new Error("FAUCET_PRIVATE_KEY is not set (repo-root .env)");
const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);

const target = resolveTarget(targetRef);

const providers = createProviders();
const clients = createClientResolver(CHAINS);
const fetchImpl = withLifiIntegration(globalThis.fetch.bind(globalThis));

/** Local-account signer: the same interface the browser wallet implements. */
function localSigner(): Signer {
  let current = 0;
  return {
    address: account.address,
    async getChainId() {
      return current;
    },
    async switchChain(chainId) {
      current = chainId;
    },
    async sendTransaction(tx) {
      const chain = findChain(tx.chainId)!;
      const wallet = createWalletClient({ account, chain: toViemChain(chain), transport: http(chain.rpcUrls[0], { timeout: 30_000 }) });
      return wallet.sendTransaction({ to: tx.to, value: tx.value, data: tx.data, gas: tx.gas });
    },
    async signTypedData(typedData) {
      return account.signTypedData(typedData as never);
    },
  };
}

function describe(ex: RouteExecution): string {
  const step = ex.steps.find((s) => s.status !== "COMPLETED" && s.status !== "CONFIRMED" && s.status !== "SKIPPED");
  const done = ex.steps.filter((s) => s.status === "COMPLETED" || s.status === "CONFIRMED" || s.status === "SKIPPED").length;
  return `${ex.state} ${done}/${ex.steps.length}${step ? ` · ${step.label} ${step.status}${"progress" in step && step.progress ? ` (${step.progress})` : ""}` : ""}`;
}

async function main() {
  const discovery = await discoverCapabilities(providers, { chains: CHAINS, assets: ASSETS, clients, fetch: fetchImpl, now: Date.now() });
  console.log(`discovery: ${discovery.edges.length} edges, ${discovery.summaries.filter((s) => s.ok).length}/${discovery.summaries.length} providers`);

  const wallet = account.address as Address;
  const scan = await scanWallet(wallet, CHAINS, ASSETS, clients);
  const plan = await planConsolidation({ wallet, scan, destination: target.node, mode: "BEST_OUTPUT", graph: discovery.graph, providers, clients, assets: ASSETS, chains: CHAINS, fetch: fetchImpl });
  console.log(`plan: ${plan.stats.routable} routable, ${plan.stats.needGas} need gas, ${plan.stats.noRoute} no route`);

  if (gatewayMode) {
    const destination = ASSETS.find((a) => a.id === target.node.assetId)!;
    // --force runs the set even when the plan's own routes are cheaper (the app only offers it when it wins).
    const offer = process.argv.includes("--force")
      ? await (async () => {
          const candidates = gatewaySetCandidates(plan, destination);
          const set = await planGatewaySet({ sources: candidates.map((s) => ({ asset: s.asset, amount: s.routable })), destination, wallet, recipient: wallet, fetch: fetchImpl, now: Date.now() });
          if (!set) return null;
          const sources = set.legs.map((l) => candidates.find((s) => s.asset.id === l.sourceAsset.id)!).filter(Boolean);
          return { set, sources, separateOut: sources.reduce((acc, s) => acc + (s.selected?.amountOut ?? 0n), 0n), separateTxCount: 0, rescued: 0 };
        })()
      : await offerGatewaySet({ plan, destination, wallet, recipient: wallet, fetch: fetchImpl, now: Date.now() });
    if (!offer) throw new Error("no Gateway set on offer (needs USDC on two or more Gateway chains, gas covered, amounts above the fees; --force ignores the comparison)");
    const legs = offer.set.legs.map((l) => `${findChain(l.sourceChainId)?.shortName} ${formatUnits(l.amountIn, l.sourceAsset.decimals)}`).join(" + ");
    console.log(`\nGateway set: ${legs} -> ${formatUnits(offer.set.totalOut, destination.decimals)} ${destination.symbol} on ${findChain(destination.chainId)?.shortName}`);
    console.log(`fee ${formatUnits(offer.set.totalFee, 6)} USDC (forwarding ${offer.set.forwardingFee ?? "?"} once) - separately ${formatUnits(offer.separateOut, destination.decimals)} - wallet ${wallet}\n`);
    for (const [i, leg] of offer.set.legs.entries()) {
      console.log(`-- deposit ${i + 1}/${offer.set.legs.length} on ${findChain(leg.sourceChainId)?.shortName}`);
      const done = await runCandidate(leg, wallet);
      if (done.state !== "COMPLETED") throw new Error(`deposit on ${findChain(leg.sourceChainId)?.shortName} ended ${done.state}: ${done.error?.message ?? ""}`);
    }
    console.log(`-- collector: one signature for ${offer.set.legs.length} chains, one mint`);
    const collected = await runCandidate(offer.set.collector, wallet);
    report(collected, destination.decimals, destination.symbol);
    process.exitCode = collected.state === "COMPLETED" ? 0 : 1;
    return;
  }

  const [chainPart, symbolPart] = sourceRef!.includes(":") ? sourceRef!.split(":") : [undefined, undefined];
  const match = (s: SourcePlan) =>
    chainPart
      ? s.sourceChainId === Number(chainPart) && s.asset.symbol.toUpperCase() === (symbolPart ?? "").toUpperCase()
      : s.asset.id === sourceRef;
  const source = plan.sources.find(match);
  if (!source) throw new Error(`no plan source for ${sourceRef} (have: ${plan.sources.map((s) => `${s.sourceChainId}:${s.asset.symbol}`).join(", ")})`);
  if (!source.selected) throw new Error(`${sourceRef} has no route: ${source.status}${source.reason ? ` (${source.reason})` : ""}`);

  const amount = parseUnits(amountHuman!, source.asset.decimals);
  const capUnits = parseUnits(String(cap), source.asset.decimals);
  if (amount > capUnits) throw new Error(`${amountHuman} ${source.asset.symbol} is above the --cap of ${cap}`);
  if (amount > source.routable) throw new Error(`only ${formatUnits(source.routable, source.asset.decimals)} ${source.asset.symbol} is routable (balance minus gas reserve)`);

  const candidate = { ...source.selected, amountIn: amount };
  console.log(
    `\nrunning ${formatUnits(amount, source.asset.decimals)} ${source.asset.symbol} on ${findChain(source.sourceChainId)?.shortName} → ${candidate.edges
      .map((e) => `${e.type}/${e.provider}`)
      .join(" → ")} → ${target.label}`,
  );
  console.log(`wallet ${wallet} · signing for real, ${minutes} min wait budget\n`);

  const result = await runCandidate(candidate, wallet);
  const dest = ASSETS.find((a) => a.id === target.node.assetId);
  report(result, dest?.decimals ?? 6, dest?.symbol ?? "");
  process.exitCode = result.state === "COMPLETED" ? 0 : 1;
}

/** One candidate through the production executor with the local signer. */
async function runCandidate(candidate: RouteCandidate, wallet: Address): Promise<RouteExecution> {
  let last = "";
  const executor = new RouteExecutor({
    providers,
    clients,
    assets: ASSETS,
    signer: localSigner(),
    fetch: fetchImpl,
    waitTimeoutMs: minutes * 60_000,
    onUpdate: (ex) => {
      const line = describe(ex);
      if (line !== last) {
        last = line;
        console.log(`  ${line}`);
      }
    },
  });
  return executor.run({ ...createExecution(candidate), recipient: wallet });
}

function report(result: RouteExecution, decimals: number, symbol: string): void {
  console.log(`\nfinal state: ${result.state}`);
  for (const step of result.steps) {
    const hash = step.type === "PERMIT" ? (step.signature ? "signed" : "-") : (step.txHash ?? "-");
    console.log(`  ${step.status.padEnd(10)} ${step.label} ${hash}`);
  }
  for (const w of result.warnings ?? []) console.log(`  warning: ${w}`);
  if (result.error) console.log(`  error: ${result.error.code} ${result.error.message}`);
  const out = result.edges[result.edges.length - 1]?.amountOut;
  if (out !== undefined) console.log(`  received: ${formatUnits(out, decimals)} ${symbol}`);
}

await main();
