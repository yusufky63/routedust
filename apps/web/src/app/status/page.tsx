import Link from "next/link";
import { ChainIcon } from "@/components/icons";
import { Module, PageTitle, TableCard, Tag } from "@/components/ui";
import { pageMeta } from "@/lib/page-meta";
import { SERVICE_ROLES, getHealth, type CheckStatus, type HealthReport } from "@/lib/server/health";

export const revalidate = 60;

export const metadata = pageMeta({
  title: "Status",
  description: "Live checks of the testnet RPCs and the Circle, LI.FI, Across and Hyperlane APIs RouteDust depends on, repeated every minute.",
  path: "/status",
});

const SUMMARY: Record<HealthReport["status"], { tone: "ok" | "warn" | "err"; tag: string; title: string }> = {
  ok: { tone: "ok", tag: "All up", title: "Everything is answering" },
  degraded: { tone: "warn", tag: "Degraded", title: "Some checks did not answer" },
  down: { tone: "err", tag: "Down", title: "Most networks are not answering" },
};

function StatusTag({ status }: { status: CheckStatus }) {
  return <Tag tone={status === "ok" ? "ok" : "err"}>{status === "ok" ? "Up" : "Down"}</Tag>;
}

function utc(ts: number): string {
  return `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/** Server-rendered from the same checks as /api/health (shared one-minute cache). */
export default async function StatusPage() {
  const report = await getHealth();
  const summary = SUMMARY[report.status];
  const servicesUp = report.services.filter((s) => s.status === "ok").length;
  const chainsUp = report.chains.filter((c) => c.status === "ok").length;
  const notAnswering = report.services.length - servicesUp + report.chains.length - chainsUp;
  const sentence =
    report.status === "ok"
      ? "Every network and service below answered the last check."
      : report.status === "degraded"
        ? `${notAnswering} of ${report.services.length + report.chains.length} checks did not answer. Routes that need a service that is down are left out until it answers again, and the app tries each network's other public RPCs before giving up on it.`
        : "Most network RPCs did not answer the last check, so balances and routes may be incomplete until they come back.";

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Status"
        meta={
          <>
            Live checks of the networks and services RouteDust depends on, repeated every minute. Last check{" "}
            <span className="whitespace-nowrap">{utc(report.checkedAt)}</span>.
          </>
        }
      >
        <Link href="/protocols" className="btn">
          Live routes →
        </Link>
        <Link href="/networks" className="btn">
          Networks
        </Link>
      </PageTitle>

      <Module raised className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={summary.tone}>{summary.tag}</Tag>
            <h2 className="display text-lg">{summary.title}</h2>
          </div>
          <p className="max-w-2xl text-sm text-muted">{sentence}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-6">
          <div>
            <div className={`display num text-2xl leading-none ${servicesUp === report.services.length ? "" : "text-warning"}`}>
              {servicesUp}/{report.services.length}
            </div>
            <div className="label mt-2">Services up</div>
          </div>
          <div>
            <div className={`display num text-2xl leading-none ${chainsUp === report.chains.length ? "" : "text-warning"}`}>
              {chainsUp}/{report.chains.length}
            </div>
            <div className="label mt-2">Network RPCs up</div>
          </div>
        </div>
      </Module>

      <TableCard title="Services" count={report.services.length} hint="The APIs behind CCTP, Gateway, LI.FI, Across and Hyperlane routes.">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.services.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-0.5 text-xs text-muted">{SERVICE_ROLES[s.id]}</div>
                </td>
                <td className="w-24">
                  <StatusTag status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Networks" count={report.chains.length} hint="Each testnet's primary public RPC, asked for its chain ID. An endpoint that answers for another chain counts as down.">
        <table className="table">
          <thead>
            <tr>
              <th>Network</th>
              <th>Chain ID</th>
              <th className="w-24">RPC</th>
            </tr>
          </thead>
          <tbody>
            {report.chains.map((c) => (
              <tr key={c.chainId}>
                <td>
                  <span className="flex items-center gap-2">
                    <ChainIcon chainId={c.chainId} size={16} />
                    {c.name}
                  </span>
                </td>
                <td className="mono text-muted">{c.chainId}</td>
                <td>
                  <StatusTag status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Module className="flex flex-col gap-2">
        <h2 className="display text-base">About these checks</h2>
        <p className="text-sm text-muted">
          Each check is one request with a four-second limit, so a single slow answer can show something as down until the next check a minute later. A service
          that answers can still refuse a particular quote. The routes that are live right now are listed on{" "}
          <Link href="/protocols" className="underline underline-offset-2">
            Protocols
          </Link>
          , and{" "}
          <Link href="/networks" className="underline underline-offset-2">
            Networks
          </Link>{" "}
          checks each RPC from your own browser, including any endpoint you set in{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>
          .
        </p>
      </Module>
    </div>
  );
}
