/**
 * LI.FI integrator settings (API key, integrator name, fee) never leave the
 * server: the web app proxies li.quest through /api/lifi, and server-side
 * discovery / scripts wrap fetch with these headers. Values come from the
 * environment (LIFI_API_KEY, LIFI_INTEGRATOR, LIFI_FEE_ENABLED,
 * LIFI_FEE_PERCENTAGE, LIFI_FEE_WALLET; the REACT_APP_ prefixed names from
 * the LI.FI widget are accepted as fallbacks).
 */
export interface LifiIntegration {
  apiKey?: string;
  /** Integrator name shown in LI.FI analytics; required for fee collection. */
  integrator?: string;
  /** Fraction taken from every transaction (0.003 = 0.3 %), as the LI.FI API expects in `fee`. */
  fee?: number;
  /** Address that receives the integrator share (LI.FI `referrer`). */
  referrer?: string;
}

export const LIFI_API_BASE = "https://li.quest/v1";
export const LIFI_HOSTS = new Set(["li.quest"]);

export function lifiIntegrationFromEnv(env: Record<string, string | undefined> = process.env): LifiIntegration {
  const enabled = (env.LIFI_FEE_ENABLED ?? env.REACT_APP_LIFI_FEE_ENABLED ?? "").toLowerCase() === "true";
  const pct = Number(env.LIFI_FEE_PERCENTAGE ?? env.REACT_APP_LIFI_FEE_PERCENTAGE ?? "");
  const wallet = env.LIFI_FEE_WALLET ?? env.REACT_APP_LIFI_FEE_WALLET;
  return {
    apiKey: env.LIFI_API_KEY || undefined,
    integrator: env.LIFI_INTEGRATOR || "routedust",
    // The env stores a percentage (0.3 = 0.3 %); the API wants a fraction.
    fee: enabled && Number.isFinite(pct) && pct > 0 ? pct / 100 : undefined,
    referrer: enabled && wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : undefined,
  };
}

/**
 * LI.FI answers 400 / code 1011 when the integrator has no fee collection set
 * up in the partner portal. Quotes must keep working then, so the fee is
 * dropped for a while instead of failing every request.
 */
const FEE_RETRY_MS = 30 * 60_000;
let feeRejectedAt = 0;

function feeActive(integration: LifiIntegration): boolean {
  return integration.fee !== undefined && Date.now() - feeRejectedAt > FEE_RETRY_MS;
}

/** Adds the API key header and, on /quote, the integrator / fee / referrer parameters. */
export function applyLifiIntegration(url: URL, headers: Headers, integration: LifiIntegration, withFee = feeActive(integration)): void {
  if (!LIFI_HOSTS.has(url.host)) return;
  if (integration.apiKey) headers.set("x-lifi-api-key", integration.apiKey);
  if (url.pathname.endsWith("/quote") || url.pathname.endsWith("/routes")) {
    // Never forward caller-supplied integrator settings.
    for (const key of ["integrator", "fee", "referrer"]) url.searchParams.delete(key);
    if (integration.integrator) url.searchParams.set("integrator", integration.integrator);
    if (withFee) {
      url.searchParams.set("fee", String(integration.fee));
      if (integration.referrer) url.searchParams.set("referrer", integration.referrer);
    }
  }
}

/** One LI.FI request with the integration applied; retried without the fee when LI.FI rejects it (code 1011). */
export async function lifiFetch(fetchImpl: typeof fetch, url: URL, init: RequestInit = {}, integration: LifiIntegration = lifiIntegrationFromEnv()): Promise<Response> {
  const send = (withFee: boolean) => {
    const target = new URL(url);
    const headers = new Headers(init.headers);
    applyLifiIntegration(target, headers, integration, withFee);
    return fetchImpl(target.toString(), { ...init, headers });
  };
  const withFee = feeActive(integration);
  const res = await send(withFee);
  if (!withFee || res.status !== 400) return res;
  const body = await res.clone().text();
  if (!/\b1011\b|not configured for collecting fees/i.test(body)) return res;
  feeRejectedAt = Date.now();
  return send(false);
}

/** fetch wrapper for server-side use (API routes, scripts). */
export function withLifiIntegration(fetchImpl: typeof fetch, integration: LifiIntegration = lifiIntegrationFromEnv()): typeof fetch {
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return fetchImpl(input, init);
    }
    if (!LIFI_HOSTS.has(url.host)) return fetchImpl(input, init);
    const headers = new Headers(init?.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined));
    return lifiFetch(fetchImpl, url, { ...init, headers }, integration);
  };
}
