import { erc20Abi, keccak256, parseAbi, type PublicClient } from "viem";
import type { Asset } from "../types/asset";
import type { Address, Hex } from "../types/common";
import type {
  ExecutionError,
  ExecutionErrorCode,
  ExecutionStep,
  RouteExecutionState,
  TxRequest,
  TxStep,
  WaitStep,
} from "../types/execution";
import type { ClientResolver, RouteProvider } from "../types/provider";
import type { RouteCandidate, RouteEdge } from "../types/route";

/** Minimal wallet abstraction. All signing happens client-side. */
export interface Signer {
  address: Address;
  getChainId(): Promise<number>;
  switchChain(chainId: number): Promise<void>;
  sendTransaction(tx: TxRequest): Promise<Hex>;
}

export interface EdgeProgress {
  edgeId: string;
  amountIn: bigint;
  amountOut?: bigint;
  sourceTxHash?: Hex;
  destinationTxHash?: Hex;
  done: boolean;
}

export interface RouteExecution {
  id: string;
  candidate: RouteCandidate;
  state: RouteExecutionState;
  steps: ExecutionStep[];
  edges: EdgeProgress[];
  createdAt: number;
  updatedAt: number;
  error?: ExecutionError;
  log: string[];
  /** Non-blocking preflight findings shown to the user (RPC disagreement, contract code changed). */
  warnings?: string[];
  /**
   * "balance": the input is whatever the wallet holds in the source asset when
   * the route starts (minus a gas reserve for native). Used by chain
   * consolidation, where earlier legs feed the bridge leg.
   */
  amountMode?: "fixed" | "balance";
  /** Batch / consolidation group this execution belongs to. */
  groupId?: string;
}

/** Contract bytecode pins: the hash seen the first time a contract was signed against. */
export interface CodePinStore {
  get(chainId: number, address: Address): Hex | undefined;
  set(chainId: number, address: Address, hash: Hex): void;
}

export interface ExecutorDeps {
  providers: RouteProvider[];
  clients: ClientResolver;
  assets: Asset[];
  signer: Signer;
  fetch?: typeof fetch;
  /** Simulate every transaction with eth_call before signing (default true). */
  simulate?: boolean;
  onUpdate?: (execution: RouteExecution) => void;
  /** Wait-step timeout, ms (default 45 minutes). */
  waitTimeoutMs?: number;
  /** Known-good bytecode hashes per "chainId:address" (registry) merged with runtime pins. */
  codePins?: CodePinStore;
  /** Gas safety multiplier for the balance-mode reserve (default 1.25). */
  gasSafetyMultiplier?: number;
}

const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F" as Address;
const gasPriceOracleAbi = parseAbi(["function getL1Fee(bytes data) view returns (uint256)"]);

export class ExecutionAbort extends Error {
  constructor(public readonly execError: ExecutionError) {
    super(execError.message);
  }
}

export function createExecution(candidate: RouteCandidate): RouteExecution {
  const now = Date.now();
  return {
    id: `exec_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    candidate,
    state: "PLANNED",
    steps: [],
    edges: candidate.edges.map((e, i) => ({
      edgeId: e.id,
      amountIn: i === 0 ? candidate.amountIn : 0n,
      done: false,
    })),
    createdAt: now,
    updatedAt: now,
    log: [],
  };
}

export function classifyError(err: unknown): ExecutionError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  let code: ExecutionErrorCode = "UNKNOWN";
  if (
    lower.includes("connector not connected") ||
    lower.includes("provider disconnected") ||
    lower.includes("provider is disconnected") ||
    lower.includes("not connected") ||
    lower.includes("4900") ||
    lower.includes("4901")
  )
    code = "WALLET_DISCONNECTED";
  else if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("4001")) code = "USER_REJECTED";
  else if (lower.includes("insufficient funds") || lower.includes("gas required exceeds")) code = "INSUFFICIENT_GAS";
  else if (lower.includes("transfer amount exceeds balance") || lower.includes("insufficient balance")) code = "INSUFFICIENT_BALANCE";
  else if (lower.includes("too little received") || lower.includes("slippage") || lower.includes("insufficient output")) code = "SLIPPAGE_EXCEEDED";
  else if (lower.includes("expired")) code = "QUOTE_EXPIRED";
  else if (lower.includes("chain mismatch") || lower.includes("wrong chain")) code = "WRONG_CHAIN";
  return { code, message: message.slice(0, 400) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readAssetBalance(client: PublicClient, asset: Asset, wallet: Address): Promise<bigint> {
  if (asset.kind === "NATIVE" || !asset.address) return client.getBalance({ address: wallet });
  return client.readContract({ address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
}

/**
 * Sequential, resumable executor for a single RouteCandidate.
 *
 * - each edge is built lazily with the ACTUAL amount produced by the previous edge;
 * - expired quotes are re-quoted (never reused);
 * - every transaction is simulated before signing when possible;
 * - steps with a known txHash are resumed by waiting for the receipt, never re-sent.
 */
export class RouteExecutor {
  private readonly providers: Map<string, RouteProvider>;
  private readonly fetchImpl: typeof fetch;
  private readonly simulate: boolean;
  private readonly waitTimeoutMs: number;
  private cancelled = false;

  constructor(private readonly deps: ExecutorDeps) {
    this.providers = new Map(deps.providers.map((p) => [p.key, p]));
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
    this.simulate = deps.simulate ?? true;
    this.waitTimeoutMs = deps.waitTimeoutMs ?? 45 * 60_000;
  }

  cancel(): void {
    this.cancelled = true;
  }

  private emit(ex: RouteExecution): void {
    ex.updatedAt = Date.now();
    this.deps.onUpdate?.({ ...ex, steps: [...ex.steps], edges: [...ex.edges], log: [...ex.log] });
  }

  private log(ex: RouteExecution, message: string): void {
    ex.log.push(`${new Date().toISOString()} ${message}`);
    this.emit(ex);
  }

  private setState(ex: RouteExecution, state: RouteExecutionState): void {
    ex.state = state;
    this.emit(ex);
  }

  private assetFor(id: string): Asset {
    const a = this.deps.assets.find((x) => x.id === id);
    if (!a) throw new ExecutionAbort({ code: "UNKNOWN", message: `Unknown asset ${id}` });
    return a;
  }

  private warn(ex: RouteExecution, message: string): void {
    ex.warnings = [...(ex.warnings ?? []), message];
    this.log(ex, `WARNING ${message}`);
  }

  /**
   * Balance mode: the route starts with whatever the wallet holds now. Native
   * inputs keep a gas reserve for the route's own transactions.
   */
  private async resolveStartAmount(ex: RouteExecution): Promise<void> {
    const first = ex.edges[0];
    if (ex.amountMode !== "balance" || !first || first.sourceTxHash || ex.steps.length > 0) return;
    const asset = ex.candidate.sourceAsset;
    const client = this.deps.clients.get(asset.chainId);
    const balance = await readAssetBalance(client, asset, this.deps.signer.address);
    let amount = balance;
    if (asset.kind === "NATIVE") {
      const fee = await this.feePerGas(client);
      const units = ex.candidate.sourceGasUnits > 0n ? ex.candidate.sourceGasUnits : 300_000n;
      const reserve = ((units * fee + (ex.candidate.sourceNativeFeeWei ?? 0n)) * BigInt(Math.round((this.deps.gasSafetyMultiplier ?? 1.25) * 100))) / 100n;
      amount = balance > reserve ? balance - reserve : 0n;
    }
    if (amount <= 0n) throw new ExecutionAbort({ code: "INSUFFICIENT_BALANCE", message: `No ${asset.symbol} balance to route on chain ${asset.chainId}`, chainId: asset.chainId });
    ex.candidate = { ...ex.candidate, amountIn: amount };
    first.amountIn = amount;
    this.log(ex, `Routing the current balance: ${amount} units of ${asset.symbol}`);
  }

  /** Cross-checks the source balance on a second RPC endpoint; disagreement is reported, not fatal. */
  private async crossCheckBalance(ex: RouteExecution): Promise<void> {
    if (ex.steps.length > 0) return;
    const asset = ex.candidate.sourceAsset;
    const secondary = this.deps.clients.secondary?.(asset.chainId);
    if (!secondary) return;
    try {
      const [a, b] = await Promise.all([
        readAssetBalance(this.deps.clients.get(asset.chainId), asset, this.deps.signer.address),
        readAssetBalance(secondary, asset, this.deps.signer.address),
      ]);
      const diff = a > b ? a - b : b - a;
      const base = a > b ? a : b;
      if (base > 0n && diff * 100n > base) {
        this.warn(ex, `Two RPC endpoints disagree on the ${asset.symbol} balance (${a} vs ${b} units); the route continues with the primary endpoint`);
      }
    } catch {
      // a flaky secondary endpoint is not a reason to stop
    }
  }

  private async feePerGas(client: PublicClient): Promise<bigint> {
    try {
      const fees = await client.estimateFeesPerGas();
      if (fees.maxFeePerGas && fees.maxFeePerGas > 0n) return fees.maxFeePerGas;
    } catch {
      // legacy chains
    }
    try {
      return ((await client.getGasPrice()) * 12n) / 10n;
    } catch {
      return 0n;
    }
  }

  /**
   * Real cost check before the wallet is asked to sign: gas × fee (+ the OP
   * Stack L1 data fee) + msg.value must fit the native balance, otherwise the
   * failure surfaces here with the exact shortfall instead of in the wallet.
   */
  private async checkGasBudget(ex: RouteExecution, step: TxStep, client: PublicClient): Promise<void> {
    if (!step.tx.gas) return;
    const chain = this.deps.clients.chain(step.chainId);
    const fee = await this.feePerGas(client);
    if (fee === 0n) return;
    let l1Fee = 0n;
    if (chain.opStack) {
      try {
        l1Fee = await client.readContract({ address: GAS_PRICE_ORACLE, abi: gasPriceOracleAbi, functionName: "getL1Fee", args: [step.tx.data] });
      } catch {
        l1Fee = 0n;
      }
    }
    const cost = step.tx.gas * fee + l1Fee + step.tx.value;
    const balance = await client.getBalance({ address: this.deps.signer.address });
    if (balance < cost) {
      const shortfall = cost - balance;
      throw new ExecutionAbort({
        code: "INSUFFICIENT_GAS",
        message: `${step.label}: needs about ${cost} wei of ${chain.nativeAsset.symbol} on ${chain.name} (gas${l1Fee > 0n ? " + L1 data fee" : ""}${step.tx.value > 0n ? " + value" : ""}), wallet has ${balance} wei`,
        detail: `shortfall ${shortfall} wei`,
        chainId: step.chainId,
      });
    }
  }

  /** Pins the bytecode hash of every contract the wallet signs against; a later change is reported. */
  private async checkContractCode(ex: RouteExecution, step: TxStep, client: PublicClient): Promise<void> {
    const pins = this.deps.codePins;
    if (!pins) return;
    if (step.type === "APPROVE") return; // token contracts are the user's assets, not our spenders
    try {
      const code = await client.getCode({ address: step.tx.to });
      if (!code || code === "0x") {
        step.warning = "target address has no bytecode";
        this.warn(ex, `${step.label}: ${step.tx.to} has no bytecode on chain ${step.chainId}`);
        return;
      }
      const hash = keccak256(code);
      const known = pins.get(step.chainId, step.tx.to);
      if (!known) {
        pins.set(step.chainId, step.tx.to, hash);
      } else if (known.toLowerCase() !== hash.toLowerCase()) {
        step.warning = "contract bytecode changed since it was last verified";
        this.warn(ex, `${step.label}: bytecode of ${step.tx.to} on chain ${step.chainId} changed (${known.slice(0, 10)}… → ${hash.slice(0, 10)}…); check the provider's announcements before signing`);
      }
    } catch {
      // a failed code read is not a signal either way
    }
  }

  async run(ex: RouteExecution): Promise<RouteExecution> {
    try {
      this.setState(ex, "PREFLIGHT");
      await this.resolveStartAmount(ex);
      await this.crossCheckBalance(ex);
      for (let i = 0; i < ex.candidate.edges.length; i += 1) {
        if (this.cancelled) throw new ExecutionAbort({ code: "USER_REJECTED", message: "Execution cancelled" });
        const progress = ex.edges[i];
        if (!progress) break;
        if (progress.done) continue;
        const edge = ex.candidate.edges[i];
        if (!edge) break;
        const amountIn = i === 0 ? ex.candidate.amountIn : (ex.edges[i - 1]?.amountOut ?? 0n);
        if (amountIn <= 0n) {
          throw new ExecutionAbort({ code: "INSUFFICIENT_BALANCE", message: `No input amount available for step ${i + 1}` });
        }
        progress.amountIn = amountIn;
        await this.runEdge(ex, edge, i, amountIn);
      }
      this.setState(ex, "COMPLETED");
    } catch (err) {
      ex.error = err instanceof ExecutionAbort ? err.execError : classifyError(err);
      if (ex.error.code === "WALLET_DISCONNECTED") {
        // Nothing was lost on-chain: keep the steps and wait for the wallet to come back.
        this.log(ex, `PAUSED: ${ex.error.message}`);
        this.setState(ex, "PAUSED");
      } else {
        this.log(ex, `FAILED ${ex.error.code}: ${ex.error.message}`);
        this.setState(ex, "FAILED");
      }
    }
    return ex;
  }

  private async runEdge(ex: RouteExecution, edgeIn: RouteEdge, index: number, amountIn: bigint): Promise<void> {
    const provider = this.providers.get(edgeIn.provider);
    if (!provider) throw new ExecutionAbort({ code: "PROVIDER_UNAVAILABLE", message: `Provider ${edgeIn.provider} missing` });
    const progress = ex.edges[index];
    if (!progress) return;

    let edge = edgeIn;
    const now = Date.now();
    const existingSteps = ex.steps.filter((s) => s.edgeId === edge.id);
    const resuming = existingSteps.length > 0;

    if (!resuming) {
      if (edge.quote.expiresAt <= now || amountIn !== edge.quote.amountIn) {
        this.log(ex, `Re-quoting ${edge.type}/${edge.provider} for ${amountIn} units`);
        const requoted = await provider.quote({
          edge,
          amountIn,
          wallet: this.deps.signer.address,
          recipient: this.deps.signer.address,
          slippageBps: 100,
          clients: this.deps.clients,
          fetch: this.fetchImpl,
          assets: this.deps.assets,
          now,
        });
        if (!requoted) throw new ExecutionAbort({ code: "QUOTE_EXPIRED", message: `Quote expired and could not be refreshed for ${edge.type}` });
        edge = requoted;
        ex.candidate.edges[index] = requoted;
      }
      const built = await provider.build(edge, {
        wallet: this.deps.signer.address,
        recipient: this.deps.signer.address,
        amountIn,
        clients: this.deps.clients,
        assets: this.deps.assets,
        fetch: this.fetchImpl,
        now,
      });
      ex.steps.push(...built);
      this.emit(ex);
    }

    const toAsset = this.assetFor(edge.to.assetId);
    const toClient = this.deps.clients.get(edge.to.chainId);
    const balanceBefore = await readAssetBalance(toClient, toAsset, this.deps.signer.address).catch(() => undefined);

    let sourceTxHash: Hex | undefined = progress.sourceTxHash;
    let amountOutFromStatus: bigint | undefined;
    let destinationTxHash: Hex | undefined;

    for (const step of ex.steps.filter((s) => s.edgeId === edge.id)) {
      if (this.cancelled) throw new ExecutionAbort({ code: "USER_REJECTED", message: "Execution cancelled" });
      if (step.status === "COMPLETED" || step.status === "CONFIRMED" || step.status === "SKIPPED") {
        if (step.type !== "WAIT_ATTESTATION" && step.type !== "PERMIT" && step.txHash && step.type === "BRIDGE") sourceTxHash = step.txHash;
        continue;
      }
      if (step.type === "PERMIT") {
        step.status = "SKIPPED";
        continue;
      }
      if (step.type === "WAIT_ATTESTATION") {
        const result = await this.runWait(ex, step, edge, provider, sourceTxHash);
        amountOutFromStatus = result.amountOut ?? amountOutFromStatus;
        destinationTxHash = result.destinationTxHash ?? destinationTxHash;
        continue;
      }
      const hash = await this.runTx(ex, step, edge);
      if (step.type === "BRIDGE") sourceTxHash = hash;
      progress.sourceTxHash = sourceTxHash;
      this.emit(ex);
    }

    // Measure actual output for the next edge.
    let amountOut = amountOutFromStatus;
    if (amountOut === undefined && balanceBefore !== undefined) {
      const balanceAfter = await readAssetBalance(toClient, toAsset, this.deps.signer.address).catch(() => undefined);
      if (balanceAfter !== undefined && balanceAfter > balanceBefore) amountOut = balanceAfter - balanceBefore;
    }
    if (amountOut === undefined) amountOut = edge.quote.minAmountOut;

    progress.amountOut = amountOut;
    progress.destinationTxHash = destinationTxHash;
    progress.done = true;
    this.log(ex, `Edge ${index + 1} ${edge.type}/${edge.provider} done, output ${amountOut} units`);
  }

  private async ensureChain(ex: RouteExecution, chainId: number): Promise<void> {
    const current = await this.deps.signer.getChainId();
    if (current !== chainId) {
      this.setState(ex, "NEEDS_CHAIN_SWITCH");
      await this.deps.signer.switchChain(chainId);
      const after = await this.deps.signer.getChainId();
      if (after !== chainId) throw new ExecutionAbort({ code: "WRONG_CHAIN", message: `Wallet is on chain ${after}, expected ${chainId}`, chainId });
    }
  }

  private async runTx(ex: RouteExecution, step: TxStep, edge: RouteEdge): Promise<Hex> {
    const client = this.deps.clients.get(step.chainId);

    if (step.txHash && (step.status === "SUBMITTED" || step.status === "WAITING")) {
      this.log(ex, `Resuming ${step.label}: waiting for ${step.txHash}`);
      return this.waitReceipt(ex, step, client);
    }

    if (step.expiresAt && step.expiresAt <= Date.now()) {
      throw new ExecutionAbort({ code: "QUOTE_EXPIRED", message: `${step.label}: quote expired before signing` });
    }

    await this.ensureChain(ex, step.chainId);
    this.setState(ex, step.type === "APPROVE" ? "NEEDS_APPROVAL" : "READY_TO_SIGN");

    if (this.simulate && step.simulate) {
      try {
        await client.call({
          account: this.deps.signer.address,
          to: step.tx.to,
          data: step.tx.data,
          value: step.tx.value,
        });
      } catch (err) {
        const classified = classifyError(err);
        const code: ExecutionErrorCode = classified.code === "UNKNOWN" ? "SIMULATION_FAILED" : classified.code;
        step.status = "FAILED";
        step.error = { code, message: `${step.label} simulation failed`, detail: classified.message };
        this.emit(ex);
        throw new ExecutionAbort(step.error);
      }
    }

    // Estimate gas on our own RPC and hand it to the wallet: wallets whose
    // built-in RPC is flaky (Rabby on some testnets) then skip their own
    // estimation instead of failing the request.
    if (!step.tx.gas) {
      try {
        const estimate = await client.estimateGas({
          account: this.deps.signer.address,
          to: step.tx.to,
          data: step.tx.data,
          value: step.tx.value,
        });
        step.tx = { ...step.tx, gas: (estimate * 125n) / 100n };
      } catch {
        // leave it to the wallet
      }
    }
    await this.checkGasBudget(ex, step, client);
    await this.checkContractCode(ex, step, client);

    step.status = "READY";
    step.startedAt = Date.now();
    this.emit(ex);

    let hash: Hex;
    try {
      hash = await this.deps.signer.sendTransaction(step.tx);
    } catch (err) {
      const e = classifyError(err);
      step.status = "FAILED";
      step.error = e;
      this.emit(ex);
      throw new ExecutionAbort(e);
    }
    step.txHash = hash;
    step.status = "SUBMITTED";
    this.setState(ex, edge.crossChain && step.type === "BRIDGE" ? "SOURCE_SUBMITTED" : "SOURCE_SUBMITTED");
    this.log(ex, `${step.label} submitted ${hash}`);
    return this.waitReceipt(ex, step, client);
  }

  private async waitReceipt(ex: RouteExecution, step: TxStep, client: PublicClient): Promise<Hex> {
    let hash = step.txHash as Hex;
    let cancelled = false;
    // A wallet "speed up" replaces the hash; a "cancel" replaces the call with a no-op.
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 10 * 60_000,
      onReplaced: (replacement) => {
        hash = replacement.transaction.hash;
        step.txHash = hash;
        if (replacement.reason === "cancelled") cancelled = true;
        this.log(ex, `${step.label}: transaction ${replacement.reason} in the wallet, now ${hash}`);
      },
    });
    if (cancelled) {
      step.status = "FAILED";
      step.error = { code: "USER_REJECTED", message: `${step.label} was cancelled in the wallet`, detail: hash };
      this.emit(ex);
      throw new ExecutionAbort(step.error);
    }
    if (receipt.status !== "success") {
      step.status = "FAILED";
      step.error = { code: "DESTINATION_FAILED", message: `${step.label} reverted on-chain`, detail: hash };
      this.emit(ex);
      throw new ExecutionAbort(step.error);
    }
    step.status = step.type === "BRIDGE" ? "CONFIRMED" : "COMPLETED";
    step.completedAt = Date.now();
    step.txHash = hash;
    this.setState(ex, "SOURCE_CONFIRMED");
    return hash;
  }

  private async runWait(
    ex: RouteExecution,
    step: WaitStep,
    edge: RouteEdge,
    provider: RouteProvider,
    sourceTxHash: Hex | undefined,
  ): Promise<{ amountOut?: bigint; destinationTxHash?: Hex }> {
    if (!sourceTxHash) throw new ExecutionAbort({ code: "UNKNOWN", message: `${step.label}: no source transaction to track` });
    step.status = "WAITING";
    step.startedAt = step.startedAt ?? Date.now();
    this.setState(ex, "CROSSCHAIN_PENDING");
    const deadline = Date.now() + this.waitTimeoutMs;

    while (Date.now() < deadline) {
      if (this.cancelled) throw new ExecutionAbort({ code: "USER_REJECTED", message: "Execution cancelled" });
      let status;
      try {
        status = await provider.status({
          edge,
          sourceTxHash,
          wallet: this.deps.signer.address,
          clients: this.deps.clients,
          fetch: this.fetchImpl,
          poll: step.poll,
        });
      } catch (err) {
        step.progress = `status check failed: ${err instanceof Error ? err.message : String(err)}`;
        this.emit(ex);
        await sleep(step.pollIntervalMs);
        continue;
      }
      step.progress = status.detail ?? status.kind;
      this.emit(ex);

      if (status.kind === "FAILED") {
        step.status = "FAILED";
        step.error = { code: "DESTINATION_FAILED", message: status.detail ?? "Provider reported failure" };
        this.emit(ex);
        throw new ExecutionAbort(step.error);
      }
      if (status.kind === "COMPLETED" || status.kind === "MINTED" || status.kind === "FILLED") {
        step.status = "COMPLETED";
        step.completedAt = Date.now();
        this.emit(ex);
        return { amountOut: status.amountOut, destinationTxHash: status.destinationTxHash };
      }
      if (status.kind === "ATTESTED" && status.needsClaim && status.claim) {
        step.status = "COMPLETED";
        step.completedAt = Date.now();
        const claim: TxStep = {
          id: `${step.id}:claim`,
          type: "CLAIM",
          chainId: status.claim.chainId,
          provider: provider.key,
          edgeId: edge.id,
          label: `Destination mint on chain ${status.claim.chainId}`,
          status: "PENDING",
          tx: status.claim,
          simulate: true,
        };
        ex.steps.push(claim);
        this.setState(ex, "DESTINATION_EXECUTING");
        const hash = await this.runTx(ex, claim, edge);
        claim.status = "COMPLETED";
        this.emit(ex);
        return { amountOut: status.amountOut, destinationTxHash: hash };
      }
      await sleep(step.pollIntervalMs);
    }

    step.error = { code: "RELAYER_DELAYED", message: `${step.label} still pending after ${Math.round(this.waitTimeoutMs / 60_000)} minutes` };
    this.emit(ex);
    throw new ExecutionAbort(step.error);
  }
}
