import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";
import { usdcAsset } from "@testnet-router/registry";
import { GATEWAY_EIP712_TYPES, planGatewaySet, sizeGatewaySet } from "./provider";

/** EIP-712 encodeType: primary type first, referenced struct types after it in alphabetical order. */
function encodeType(primary: keyof typeof GATEWAY_EIP712_TYPES): string {
  const types = GATEWAY_EIP712_TYPES as Record<string, { name: string; type: string }[]>;
  const deps = new Set<string>();
  const visit = (t: string) => {
    for (const f of types[t] ?? []) {
      const base = f.type.replace(/\[\]$/, "");
      if (types[base] && !deps.has(base) && base !== primary) {
        deps.add(base);
        visit(base);
      }
    }
  };
  visit(primary);
  return [primary, ...[...deps].sort()].map((t) => `${t}(${types[t]!.map((f) => `${f.type} ${f.name}`).join(",")})`).join("");
}

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const FORWARDING_FEE = 3_100_000n;

/** /v1/estimate stand-in: base fee per domain, the forwarding fee lands on the first intent of the request. */
function estimateFetch(seen: { intents: { spec: { sourceDomain: number; value: string } }[] }[]): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { intents: { spec: { sourceDomain: number; value: string; salt: string } }[] }[];
    seen.push(body[0]!);
    const intents = body[0]!.intents.map((i, index) => ({ maxBlockHeight: "1", maxFee: String((index === 0 ? FORWARDING_FEE : 0n) + 10_000n), spec: i.spec }));
    return new Response(JSON.stringify({ body: [{ burnIntentSet: { intents } }], fees: { forwardingFee: "3.1" } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("circle-gateway burn intent sets", () => {
  it("signs the exact struct types GatewayWallet hashes", () => {
    // BurnIntents.sol: BURN_INTENT_TYPEHASH and BURN_INTENT_SET_TYPEHASH.
    expect(keccak256(toHex(encodeType("BurnIntent")))).toBe("0x8b99d17a83a2dd1add9fc2a450e22732c7e8564aa110ab99c20485a7a10ba37c");
    expect(keccak256(toHex(encodeType("BurnIntentSet")))).toBe("0xe30760cf7d79e3521ad1553a73a6c6f8d33226ea613eaa29ceda6de148fbd07a");
  });

  it("puts the largest source first, drops dust below its own fee and deducts every fee from its own source", async () => {
    const seen: { intents: { spec: { sourceDomain: number; value: string } }[] }[] = [];
    const sizing = await sizeGatewaySet({
      fetch: estimateFetch(seen),
      wallet: WALLET,
      recipient: WALLET,
      destinationDomain: 0,
      destinationToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      sources: [
        { chainId: 84532, domain: 6, token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount: 2_000_000n },
        { chainId: 43113, domain: 1, token: "0x5425890298aed601595a70AB815c96711a31Bc65", amount: 9_000n },
        { chainId: 421614, domain: 3, token: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", amount: 5_000_000n },
      ],
    });
    expect(seen).toHaveLength(2); // re-estimated once after dropping the 0.009 USDC source
    expect(seen[0]!.intents.map((i) => i.spec.sourceDomain)).toEqual([3, 6, 1]);
    expect(sizing?.dropped).toEqual([43113]);
    expect(sizing?.intents.map((i) => [i.spec.sourceDomain, i.spec.value, i.maxFee])).toEqual([
      [3, String(5_000_000n - FORWARDING_FEE - 10_000n), String(FORWARDING_FEE + 10_000n)],
      [6, "1990000", "10000"],
    ]);
    expect(sizing?.totalOut).toBe(7_000_000n - FORWARDING_FEE - 20_000n);
    expect(new Set(sizing?.intents.map((i) => i.spec.salt)).size).toBe(2);
  });

  it("returns nothing when even the largest source cannot pay the forwarding fee", async () => {
    const sizing = await sizeGatewaySet({
      fetch: estimateFetch([]),
      wallet: WALLET,
      recipient: WALLET,
      destinationDomain: 0,
      destinationToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      sources: [
        { chainId: 84532, domain: 6, token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", amount: 2_000_000n },
        { chainId: 421614, domain: 3, token: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", amount: 1_000_000n },
      ],
    });
    expect(sizing).toBeNull();
  });

  it("plans deposit legs plus one collector whose amounts line up", async () => {
    const dest = usdcAsset(11155111)!;
    const plan = await planGatewaySet({
      sources: [
        { asset: usdcAsset(84532)!, amount: 4_000_000n },
        { asset: usdcAsset(421614)!, amount: 6_000_000n },
        { asset: dest, amount: 9_000_000n }, // already on the destination chain: not part of the set
      ],
      destination: dest,
      wallet: WALLET,
      recipient: WALLET,
      fetch: estimateFetch([]),
      now: 1_000,
    });
    expect(plan?.legs.map((l) => [l.sourceChainId, l.amountIn, (l.edges[0]!.meta as { role: string }).role])).toEqual([
      [421614, 6_000_000n, "deposit"],
      [84532, 4_000_000n, "deposit"],
    ]);
    const meta = plan!.collector.edges[0]!.meta as { role: string; set: { chainId: number; planned: string }[] };
    expect(meta.role).toBe("collect");
    expect(meta.set.map((s) => [s.chainId, s.planned])).toEqual([[421614, "6000000"], [84532, "4000000"]]);
    expect(plan!.collector.amountIn).toBe(10_000_000n);
    expect(plan!.collector.edges[0]!.quote.amountIn).toBe(plan!.collector.amountIn);
    expect(plan!.totalOut).toBe(10_000_000n - FORWARDING_FEE - 20_000n);
    expect(new Set([...plan!.legs, plan!.collector].map((c) => c.edges[0]!.id)).size).toBe(3);
  });
});
