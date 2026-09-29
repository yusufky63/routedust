/**
 * Opens every faucet, official bridge and chain-exit link in the registry and
 * sorts the answers.   pnpm probe-links [--all]
 *
 * A 200 does not prove a faucet pays out (most are JS apps, some are empty),
 * so this only catches links that are gone, broken or moved: GONE (404/410),
 * ERROR (5xx, DNS, TLS, timeout) and MOVED (landed on another host, or on the
 * home page of a deep link). BLOCKED (401/403/429) is bot protection and says
 * nothing either way. Exits 1 when anything is GONE or ERROR.
 */
import { CHAIN_EXITS, FAUCETS, OFFICIAL_BRIDGES } from "@testnet-router/registry";

type Verdict = "OK" | "MOVED" | "BLOCKED" | "GONE" | "ERROR";

interface Link {
  kind: "faucet" | "bridge" | "exit";
  id: string;
  url: string;
}

interface Result extends Link {
  verdict: Verdict;
  status?: number;
  finalUrl?: string;
  error?: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;

function links(): Link[] {
  return [
    ...FAUCETS.map((f) => ({ kind: "faucet" as const, id: f.id, url: f.url })),
    ...OFFICIAL_BRIDGES.map((b) => ({ kind: "bridge" as const, id: b.id, url: b.url })),
    ...CHAIN_EXITS.map((e) => ({ kind: "exit" as const, id: `exit-${e.chainId}`, url: e.url })),
  ];
}

/** "www." and a trailing slash do not count as a move. */
function sameHost(a: URL, b: URL): boolean {
  return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
}

function classify(link: Link, status: number, finalUrl: string): Verdict {
  if (status === 404 || status === 410) return "GONE";
  if (status === 401 || status === 403 || status === 429) return "BLOCKED";
  if (status >= 500 || status < 200 || status >= 400) return "ERROR";
  const from = new URL(link.url);
  const to = new URL(finalUrl);
  if (!sameHost(from, to)) return "MOVED";
  const deep = from.pathname.replace(/\/$/, "") !== "";
  if (deep && to.pathname.replace(/\/$/, "") === "") return "MOVED";
  return "OK";
}

async function probe(link: Link): Promise<Result> {
  try {
    const res = await fetch(link.url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.body?.cancel();
    return { ...link, status: res.status, finalUrl: res.url, verdict: classify(link, res.status, res.url) };
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code;
    return { ...link, verdict: "ERROR", error: cause ?? (e as Error).name ?? String(e) };
  }
}

async function main() {
  const showAll = process.argv.includes("--all");
  const queue = links();
  const results: Result[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let link = queue.shift(); link; link = queue.shift()) results.push(await probe(link));
    }),
  );
  const order: Verdict[] = ["GONE", "ERROR", "MOVED", "BLOCKED", "OK"];
  results.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || a.id.localeCompare(b.id));
  for (const r of results) {
    if (!showAll && r.verdict === "OK") continue;
    const moved = r.finalUrl && r.finalUrl !== r.url ? ` → ${r.finalUrl}` : "";
    console.log(`${r.verdict.padEnd(8)} ${r.kind.padEnd(7)} ${r.id.padEnd(30)} ${String(r.status ?? r.error ?? "").padEnd(12)} ${r.url}${moved}`);
  }
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  console.log(`\n${results.length} links: ${order.map((v) => `${count(v)} ${v}`).join(", ")}${showAll ? "" : " (OK hidden; --all shows them)"}`);
  if (count("GONE") + count("ERROR") > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
