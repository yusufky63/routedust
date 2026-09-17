import type { Config } from "wagmi";
import type { Address, Hex, TxRequest } from "@testnet-router/core";
import { getClients } from "./router";
import { createWagmiSigner } from "./signer";
import { useRouterStore } from "./store";

export interface SimpleStep {
  label: string;
  tx: TxRequest;
}

export interface StepOutcome {
  label: string;
  status: "pending" | "signing" | "confirmed" | "failed" | "skipped";
  txHash?: Hex;
  error?: string;
}

/**
 * Minimal sequential runner for page-local transactions (liquidity, revokes):
 * simulate, estimate gas on our RPC, sign in the wallet, wait for the
 * receipt. Route executions use the full RouteExecutor instead.
 */
export async function runSteps(config: Config, address: Address, steps: SimpleStep[], onUpdate: (outcomes: StepOutcome[]) => void): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = steps.map((s) => ({ label: s.label, status: "pending" }));
  const emit = () => onUpdate(outcomes.map((o) => ({ ...o })));
  const signer = createWagmiSigner(config, address);
  const clients = getClients(useRouterStore.getState().settings.rpcOverrides);
  emit();
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] as SimpleStep;
    const outcome = outcomes[i] as StepOutcome;
    const client = clients.get(step.tx.chainId);
    try {
      if ((await signer.getChainId()) !== step.tx.chainId) await signer.switchChain(step.tx.chainId);
      await client.call({ account: address, to: step.tx.to, data: step.tx.data, value: step.tx.value });
      let gas: bigint | undefined;
      try {
        gas = ((await client.estimateGas({ account: address, to: step.tx.to, data: step.tx.data, value: step.tx.value })) * 125n) / 100n;
      } catch {
        gas = undefined;
      }
      outcome.status = "signing";
      emit();
      const hash = await signer.sendTransaction({ ...step.tx, gas });
      outcome.txHash = hash;
      emit();
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction reverted on-chain");
      outcome.status = "confirmed";
      emit();
    } catch (err) {
      outcome.status = "failed";
      outcome.error = err instanceof Error ? err.message.split("\n")[0]?.slice(0, 200) : String(err);
      for (let j = i + 1; j < outcomes.length; j += 1) (outcomes[j] as StepOutcome).status = "skipped";
      emit();
      break;
    }
  }
  return outcomes;
}
