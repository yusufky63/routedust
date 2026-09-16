/**
 * Prints which testnets each provider registry supports right now and which
 * ones are candidates for the chain registry.   pnpm coverage [--all]
 */
import { fetchCoverage } from "@testnet-router/providers";

async function main() {
  const showAll = process.argv.includes("--all");
  console.time("coverage");
  const report = await fetchCoverage(globalThis.fetch);
  console.timeEnd("coverage");
  for (const s of report.sources) {
    console.log(`${s.ok ? "OK " : "ERR"} ${s.name.padEnd(30)} ${String(s.count).padStart(5)} entries  ${s.error ?? ""}`);
  }
  const cols = ["circle", "uniswap", "across", "lifi", "layerzero", "hyperlane"] as const;
  const header = `${"chain".padEnd(34)} ${"id".padStart(10)} ${"native".padEnd(7)} ${cols.map((c) => c.padEnd(9)).join("")} status`;
  console.log(`\n${header}\n${"-".repeat(header.length)}`);
  const rows = showAll ? report.chains : report.chains.filter((c) => c.inRegistry || c.score >= 2);
  for (const c of rows) {
    const marks = cols.map((k) => {
      const p = c.providers[k];
      if (!p) return "·".padEnd(9);
      if (k === "circle") return `d${c.providers.circle?.domain}${c.providers.circle?.chainIdConfidence === "assumed" ? "?" : ""}`.padEnd(9);
      if (k === "uniswap") return `${c.providers.uniswap?.v3 ? "v3" : ""}${c.providers.uniswap?.v4 ? "v4" : ""}`.padEnd(9);
      if (k === "layerzero") return `eid${c.providers.layerzero?.eid}`.padEnd(9);
      return "yes".padEnd(9);
    });
    console.log(`${c.name.slice(0, 33).padEnd(34)} ${String(c.chainId).padStart(10)} ${(c.nativeSymbol ?? "?").padEnd(7)} ${marks.join("")} ${c.inRegistry ? "IN REGISTRY" : `${c.score} providers`}`);
  }
  console.log(`\n${report.chains.filter((c) => !c.inRegistry).length} candidate testnets (${rows.filter((c) => !c.inRegistry).length} shown; use --all for every one)`);
  if (report.circleUnmapped.length) console.log(`Circle entries without EVM chain id: ${report.circleUnmapped.map((u) => `${u.name} (d${u.domain})`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
