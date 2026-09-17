import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import type { Asset, ClientResolver, ExecutionStep, RouteCandidate, RouteEdge, RouteProvider, TxRequest } from "../types";
import { RouteExecutor, createExecution, type Signer } from "./engine";

const at = "2026-09-16T00:00:00Z";
const wallet = "0x00000000000000000000000000000000000000aa" as const;

const usdcSep: Asset = {
  id: "11155111:0xusdc",
  chainId: 11155111,
  canonicalAssetId: "USDC",
  kind: "ERC20",
  address: "0x0000000000000000000000000000000000000001",
  decimals: 6,
  symbol: "USDC",
  name: "USDC",
  representation: "CIRCLE_NATIVE",
  verified: true,
};
const usdcBase: Asset = { ...usdcSep, id: "84532:0xusdc", chainId: 84532 };

function edge(expiresAt: number): RouteEdge {
  return {
    id: "cctp:sep>base",
    provider: "cctp",
    type: "CCTP",
    from: { chainId: 11155111, canonicalAssetId: "USDC", representation: "CIRCLE_NATIVE", assetId: usdcSep.id },
    to: { chainId: 84532, canonicalAssetId: "USDC", representation: "CIRCLE_NATIVE", assetId: usdcBase.id },
    crossChain: true,
    requiresApproval: true,
    requiresSourceGas: true,
    requiresDestinationGas: true,
    outputCanonicality: "CANONICAL",
    reliabilityClass: "ISSUER",
    baselineGasUnits: 180_000n,
    baselineSeconds: 60,
    source: { kind: "manual", url: "t", lastVerifiedAt: at },
    health: "QUOTED",
    quote: {
      provider: "cctp",
      amountIn: 1_000_000n,
      amountOut: 999_000n,
      minAmountOut: 999_000n,
      feeOut: 1_000n,
      estimatedGasUnits: 180_000n,
      estimatedSeconds: 60,
      txCount: 2,
      quotedAt: Date.now(),
      expiresAt,
    },
  };
}

function candidate(e: RouteEdge): RouteCandidate {
  return {
    id: "cand",
    sourceChainId: 11155111,
    sourceAsset: usdcSep,
    amountIn: 1_000_000n,
    destination: e.to,
    edges: [e],
    amountOut: e.quote.amountOut,
    minAmountOut: e.quote.minAmountOut,
    txCount: 3,
    swapCount: 0,
    bridgeCount: 1,
    estimatedSeconds: 60,
    sourceGasUnits: 240_000n,
    outputCanonicality: "CANONICAL",
    reliabilityClass: "ISSUER",
    requiresSourceGas: true,
    requiresDestinationGas: true,
    health: "QUOTED",
  };
}

interface Harness {
  provider: RouteProvider;
  signer: Signer;
  clients: ClientResolver;
  sent: TxRequest[];
  switched: number[];
  statusCalls: number;
}

function harness(opts: { requote?: boolean; fail?: "simulate" | "revert" } = {}): Harness {
  const sent: TxRequest[] = [];
  const switched: number[] = [];
  let currentChain = 84532;
  let balanceBase = 5_000_000n;
  let statusCalls = 0;

  const client = {
    call: async () => {
      if (opts.fail === "simulate") throw new Error("execution reverted: Too little received");
      return { data: "0x" };
    },
    waitForTransactionReceipt: async () => ({ status: opts.fail === "revert" ? "reverted" : "success" }),
    getBalance: async () => 0n,
    readContract: async () => balanceBase,
  } as unknown as PublicClient;

  const h: Harness = {
    sent,
    switched,
    get statusCalls() {
      return statusCalls;
    },
    clients: { get: () => client, chain: () => ({}) as never },
    signer: {
      address: wallet,
      getChainId: async () => currentChain,
      switchChain: async (id) => {
        switched.push(id);
        currentChain = id;
      },
      sendTransaction: async (tx) => {
        sent.push(tx);
        return `0x${sent.length.toString(16).padStart(64, "0")}` as `0x${string}`;
      },
    },
    provider: {
      key: "cctp",
      name: "cctp",
      source: { kind: "manual", url: "t", lastVerifiedAt: at },
      async discover() {
        return [];
      },
      async quote(req) {
        if (!opts.requote) return null;
        return { ...(req.edge as RouteEdge), quote: { ...edge(Date.now() + 60_000).quote, amountIn: req.amountIn } };
      },
      async build(e, ctx): Promise<ExecutionStep[]> {
        const tx = { chainId: 11155111, to: "0x0000000000000000000000000000000000000002" as const, data: "0x" as const, value: 0n };
        return [
          {
            id: "a",
            type: "APPROVE",
            chainId: 11155111,
            provider: "cctp",
            edgeId: e.id,
            label: "approve",
            status: "PENDING",
            simulate: true,
            // approve(0x…02, 1_000_000)
            tx: { ...tx, data: `0x095ea7b3${"0".repeat(24)}${"0".repeat(39)}2${(1_000_000).toString(16).padStart(64, "0")}` as `0x${string}` },
          },
          { id: "b", type: "BRIDGE", chainId: 11155111, provider: "cctp", edgeId: e.id, label: "burn", status: "PENDING", simulate: true, tx: { ...tx, value: ctx.amountIn } },
          { id: "w", type: "WAIT_ATTESTATION", chainId: 84532, provider: "cctp", edgeId: e.id, label: "attest", status: "PENDING", pollIntervalMs: 1, poll: {} },
        ];
      },
      async status() {
        statusCalls += 1;
        if (statusCalls < 2) return { kind: "PENDING", detail: "waiting" };
        balanceBase += 999_000n;
        return {
          kind: "ATTESTED",
          needsClaim: true,
          amountOut: 999_000n,
          claim: { chainId: 84532, to: "0x0000000000000000000000000000000000000003", data: "0x", value: 0n },
        };
      },
    },
  };
  return h;
}

describe("RouteExecutor", () => {
  it("runs approve, burn, waits for attestation, then claims on destination", async () => {
    const h = harness();
    const updates: string[] = [];
    const executor = new RouteExecutor({
      providers: [h.provider],
      clients: h.clients,
      assets: [usdcSep, usdcBase],
      signer: h.signer,
      onUpdate: (ex) => updates.push(ex.state),
    });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() + 60_000))));

    expect(ex.state).toBe("COMPLETED");
    expect(ex.error).toBeUndefined();
    expect(h.sent).toHaveLength(3); // approve + burn + claim
    expect(h.switched).toEqual([11155111, 84532]);
    expect(ex.steps.map((s) => s.status)).toEqual(["COMPLETED", "CONFIRMED", "COMPLETED", "COMPLETED"]);
    expect(ex.edges[0]?.amountOut).toBe(999_000n);
    expect(updates).toContain("NEEDS_CHAIN_SWITCH");
    expect(updates).toContain("CROSSCHAIN_PENDING");
    expect(updates).toContain("DESTINATION_EXECUTING");
  });

  it("runs a signature-only edge: the wait hands the permit a payload computed after it, nothing is sent", async () => {
    const h = harness();
    const signed: unknown[] = [];
    const polls: Record<string, unknown>[] = [];
    const typed = (fee: bigint) => ({ domain: { name: "GatewayWallet", version: "1" }, types: { T: [{ name: "fee", type: "uint256" }] }, primaryType: "T", message: { fee } });
    const provider: typeof h.provider = {
      ...h.provider,
      async build(e): Promise<ExecutionStep[]> {
        const base = { chainId: 11155111, provider: "cctp", edgeId: e.id, status: "PENDING" } as const;
        return [
          { ...base, id: "f", type: "WAIT_ATTESTATION", label: "finality", pollIntervalMs: 1, poll: { stage: "finality" } },
          { ...base, id: "p", type: "PERMIT", label: "sign", typedData: typed(1n) },
          { ...base, id: "t", type: "WAIT_ATTESTATION", label: "transfer", pollIntervalMs: 1, poll: { stage: "transfer", fee: "1" } },
        ];
      },
      async status(exec) {
        polls.push({ ...exec.poll, sourceTxHash: exec.sourceTxHash });
        if (exec.poll?.stage === "finality") return { kind: "COMPLETED", nextPermit: { typedData: typed(2n), summary: "fresh", poll: { fee: "2" } } };
        return { kind: "MINTED", amountOut: 777n };
      },
    };
    const executor = new RouteExecutor({
      providers: [provider],
      clients: h.clients,
      assets: [usdcSep, usdcBase],
      signer: { ...h.signer, signTypedData: async (td) => (signed.push(td.message), "0xabcd") },
    });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() + 60_000))));

    expect(ex.state).toBe("COMPLETED");
    expect(h.sent).toHaveLength(0);
    expect(signed).toEqual([{ fee: 2n }]);
    expect(polls[1]).toMatchObject({ stage: "transfer", fee: "2", permitSignature: "0xabcd", sourceTxHash: `0x${"0".repeat(64)}` });
    expect(ex.edges[0]?.amountOut).toBe(777n);
  });

  it("still refuses a wait without a source transaction when the edge has transaction steps", async () => {
    const h = harness();
    const provider: typeof h.provider = {
      ...h.provider,
      async build(e): Promise<ExecutionStep[]> {
        const tx = { chainId: 11155111, to: "0x0000000000000000000000000000000000000002" as const, data: "0x" as const, value: 0n };
        return [
          { id: "a", type: "APPROVE", chainId: 11155111, provider: "cctp", edgeId: e.id, label: "approve", status: "PENDING", simulate: true, tx },
          { id: "w", type: "WAIT_ATTESTATION", chainId: 84532, provider: "cctp", edgeId: e.id, label: "attest", status: "PENDING", pollIntervalMs: 1, poll: {} },
        ];
      },
    };
    const executor = new RouteExecutor({ providers: [provider], clients: h.clients, assets: [usdcSep, usdcBase], signer: h.signer });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() + 60_000))));
    expect(ex.state).toBe("FAILED");
    expect(ex.error?.message).toContain("no source transaction to track");
  });

  it("waits for a fresh approval to be visible and retries an allowance revert instead of failing", async () => {
    const h = harness();
    // A load-balanced RPC: the first reads and the first simulation after the approval are a block behind.
    let allowanceReads = 0;
    let calls = 0;
    const client = {
      call: async () => {
        calls += 1;
        if (calls === 2) throw new Error("execution reverted: ERC20: transfer amount exceeds allowance");
        return { data: "0x" };
      },
      waitForTransactionReceipt: async () => ({ status: "success" }),
      getBalance: async () => 0n,
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName !== "allowance") return 5_000_000n;
        allowanceReads += 1;
        return allowanceReads < 2 ? 0n : 1_000_000n;
      },
      getTransactionCount: async () => 0,
      getBlockNumber: async () => 1n,
      estimateGas: async () => 100_000n,
      estimateFeesPerGas: async () => ({ maxFeePerGas: 0n }),
      getGasPrice: async () => 0n,
    } as unknown as PublicClient;

    const executor = new RouteExecutor({
      providers: [h.provider],
      clients: { get: () => client, chain: () => ({}) as never },
      assets: [usdcSep, usdcBase],
      signer: h.signer,
    });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() + 60_000))));

    expect(ex.state).toBe("COMPLETED");
    expect(allowanceReads).toBeGreaterThanOrEqual(2); // polled until the approval was served
    expect(calls).toBeGreaterThanOrEqual(3); // approve, the stale revert, then the retry
    expect(ex.steps.find((s) => s.type === "BRIDGE")?.status).toBe("CONFIRMED");
  }, 20_000);

  it("blocks stale quotes that cannot be refreshed", async () => {
    const h = harness({ requote: false });
    const executor = new RouteExecutor({ providers: [h.provider], clients: h.clients, assets: [usdcSep, usdcBase], signer: h.signer });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() - 1))));
    expect(ex.state).toBe("FAILED");
    expect(ex.error?.code).toBe("QUOTE_EXPIRED");
    expect(h.sent).toHaveLength(0);
  });

  it("re-quotes stale quotes when the provider can refresh them", async () => {
    const h = harness({ requote: true });
    const executor = new RouteExecutor({ providers: [h.provider], clients: h.clients, assets: [usdcSep, usdcBase], signer: h.signer });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() - 1))));
    expect(ex.state).toBe("COMPLETED");
  });

  it("surfaces simulation failures with a granular error before signing", async () => {
    const h = harness({ fail: "simulate" });
    const executor = new RouteExecutor({ providers: [h.provider], clients: h.clients, assets: [usdcSep, usdcBase], signer: h.signer });
    const ex = await executor.run(createExecution(candidate(edge(Date.now() + 60_000))));
    expect(ex.state).toBe("FAILED");
    expect(ex.error?.code).toBe("SLIPPAGE_EXCEEDED");
    expect(h.sent).toHaveLength(0);
  });

  it("resumes a submitted step by waiting for its receipt instead of re-sending", async () => {
    const h = harness();
    const executor = new RouteExecutor({ providers: [h.provider], clients: h.clients, assets: [usdcSep, usdcBase], signer: h.signer });
    const ex = createExecution(candidate(edge(Date.now() + 60_000)));
    const steps = await h.provider.build(ex.candidate.edges[0] as RouteEdge, {
      wallet,
      recipient: wallet,
      amountIn: 1_000_000n,
      clients: h.clients,
      assets: [],
      fetch: globalThis.fetch,
      now: Date.now(),
    });
    (steps[0] as { status: string }).status = "COMPLETED";
    const burn = steps[1] as { status: string; txHash?: string };
    burn.status = "SUBMITTED";
    burn.txHash = "0x" + "1".repeat(64);
    ex.steps = steps;
    const result = await executor.run(ex);
    expect(result.state).toBe("COMPLETED");
    expect(h.sent).toHaveLength(1); // only the destination claim
  });
});
