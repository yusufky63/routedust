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
    integrator: env.LIFI_INTEGRATOR || "dustline",
    // The env stores a percentage (0.3 = 0.3 %); the API wants a fraction.
    fee: enabled && Number.isFinite(pct) && pct > 0 ? pct / 100 : undefined,
    referrer: enabled && wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet : undefined,
  };
}

/** Adds the API key header and, on /quote, the integrator / fee / referrer parameters. */
export function applyLifiIntegration(url: URL, headers: Headers, integration: LifiIntegration): void {
  if (!LIFI_HOSTS.has(url.host)) return;
  if (integration.apiKey) headers.set("x-lifi-api-key", integration.apiKey);
  if (url.pathname.endsWith("/quote") || url.pathname.endsWith("/routes")) {
    if (integration.integrator) url.searchParams.set("integrator", integration.integrator);
    if (integration.fee !== undefined) url.searchParams.set("fee", String(integration.fee));
    if (integration.referrer) url.searchParams.set("referrer", integration.referrer);
  }
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
    applyLifiIntegration(url, headers, integration);
    return fetchImpl(url.toString(), { ...init, headers });
  };
}
