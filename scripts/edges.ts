/**
 * Runs provider discovery against the live networks and quotes one sample
 * amount per provider, so a registry or adapter change can be checked without
 * the browser:
 *   pnpm edges                # all providers
 *   pnpm edges hyperlane v4   # only providers whose key contains a filter
 */
import { createClientResolver, formatAmount, type Asset, type CapabilityEdge } from "@testnet-router/core";
import { ASSETS, CHAINS, findChain } from "@testnet-router/registry";
import { createProviders, discoverCapabilities } from "@testnet-router/providers";

const WALLET = "0x000000000000000000000000000000000000dEaD" as const;
const filters = process.argv.slice(2).map((s) => s.toLowerCase());

function assetOf(id: string): Asset | undefined {
  return ASSETS.find((a) => a.id === id);
}

function sampleAmount(asset: Asset): bigint {
  // 0.002 native-like or 2 USDC-like: enough to exercise fees without hitting tiny testnet caps.
  return asset.decimals >= 18 ? 2n * 10n ** 15n : 2n * 10n ** BigInt(asset.decimals);
}

function label(e: CapabilityEdge): string {
  const from = findChain(e.from.chainId)?.shortName ?? e.from.chainId;
  const to = findChain(e.to.chainId)?.shortName ?? e.to.chainId;
  return `${from}/${e.from.canonicalAssetId} → ${to}/${e.to.canonicalAssetId}${e.id.split(">")[1]?.includes(":") ? ` [${e.id.split(":").pop()}]` : ""}`;
}

async function main() {
  const providers = createProviders().filter((p) => filters.length === 0 || filters.some((f) => p.key.includes(f)));
  const clients = createClientResolver(CHAINS);
  const started = Date.now();
  const result = await discoverCapabilities(providers, { chains: CHAINS, assets: ASSETS, clients, fetch: globalThis.fetch.bind(globalThis), now: Date.now() });
  console.log(`discovery: ${result.edges.length} edges in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const s of result.summaries) {
    console.log(`  ${s.ok ? "OK " : "ERR"} ${s.key.padEnd(18)} ${String(s.edges).padStart(4)} edges  chains ${s.chains.length}${s.error ? `  ${s.error.slice(0, 80)}` : ""}`);
  }

  // One quote per provider per (source chain) to keep RPC usage sane.
  for (const p of providers) {
    const edges = result.edges.filter((e) => e.provider === p.key);
    const seen = new Set<string>();
    for (const e of edges) {
      const key = `${e.from.chainId}:${e.from.assetId}:${e.type}:${e.id.split(":").pop()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const from = assetOf(e.from.assetId);
      const to = assetOf(e.to.assetId);
      if (!from || !to) continue;
      const amountIn = sampleAmount(from);
      try {
        const q = await p.quote({ edge: e, amountIn, wallet: WALLET, recipient: WALLET, slippageBps: 50, clients, fetch: globalThis.fetch.bind(globalThis), assets: ASSETS, now: Date.now() });
        if (!q) {
          console.log(`  -- ${p.key.padEnd(14)} ${label(e).padEnd(44)} no quote for ${formatAmount(amountIn, from.decimals)} ${from.symbol}`);
          continue;
        }
        const extra = [
          q.quote.priceImpactBps !== undefined ? `impact ${(q.quote.priceImpactBps / 100).toFixed(2)}%` : "",
          q.quote.nativeFeeWei ? `msg.value ${q.quote.nativeFeeWei} wei` : "",
          `tx ${q.quote.txCount}`,
          e.requiresDestinationGas ? "dst gas" : "no dst gas",
        ]
          .filter(Boolean)
          .join(" · ");
        console.log(`  ok ${p.key.padEnd(14)} ${label(e).padEnd(44)} ${formatAmount(amountIn, from.decimals)} ${from.symbol} → ${formatAmount(q.quote.amountOut, to.decimals)} ${to.symbol} · ${extra}${q.healthNote ? ` · ${q.healthNote}` : ""}`);
      } catch (err) {
        console.log(`  !! ${p.key.padEnd(14)} ${label(e).padEnd(44)} ${(err as Error).message.split("\n")[0]?.slice(0, 100)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
