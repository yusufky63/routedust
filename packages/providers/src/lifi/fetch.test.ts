import { describe, expect, it } from "vitest";
import { lifiFetch, type LifiIntegration } from "./fetch";

const integration: LifiIntegration = { apiKey: "k", integrator: "routedust", fee: 0.003, referrer: "0x0000000000000000000000000000000000000001" };

describe("lifiFetch", () => {
  it("retries a quote without the fee when LI.FI rejects fee collection (1011) and keeps it off afterwards", async () => {
    const seen: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push(url);
      expect(new Headers(init?.headers).get("x-lifi-api-key")).toBe("k");
      if (url.searchParams.has("fee")) {
        return new Response(JSON.stringify({ code: 1011, message: 'Integrator "routedust" is not configured for collecting fees.' }), { status: 400 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    // Caller-supplied integrator settings are never forwarded.
    const url = new URL("https://li.quest/v1/quote?fromChain=1&fee=0.5&referrer=0xdead&integrator=evil");
    const res = await lifiFetch(fetchImpl, url, {}, integration);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen[0]!.searchParams.get("fee")).toBe("0.003");
    expect(seen[0]!.searchParams.get("integrator")).toBe("routedust");
    expect(seen[1]!.searchParams.has("fee")).toBe(false);
    expect(seen[1]!.searchParams.has("referrer")).toBe(false);
    expect(seen[1]!.searchParams.get("integrator")).toBe("routedust");

    const again = await lifiFetch(fetchImpl, new URL("https://li.quest/v1/quote?fromChain=1"), {}, integration);
    expect(again.status).toBe(200);
    expect(seen).toHaveLength(3);
    expect(seen[2]!.searchParams.has("fee")).toBe(false);
  });
});
