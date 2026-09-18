import { getWalletClient } from "wagmi/actions";
import type { Config } from "wagmi";
import { createPublicClient, formatEther, http, type Address, type Chain, type Hex, type TransactionReceipt } from "viem";
import { giwaSepolia, baseSepolia, inkSepolia, optimismSepolia, sepolia, unichainSepolia, worldchainSepolia } from "viem/chains";
import { getWithdrawals, publicActionsL1, publicActionsL2, walletActionsL1, walletActionsL2, type GetWithdrawalStatusReturnType } from "viem/op-stack";
import { CHAINS, findChain } from "@testnet-router/registry";

/**
 * Leaving an OP Stack rollup takes days: start on the L2, prove on Ethereum
 * Sepolia once a dispute game covers that block, then finalise after the
 * challenge period (about seven days). That does not fit a route — quotes
 * expire in minutes — so a withdrawal is kept as state and its two L1
 * transactions are signed when they come due. A withdrawal started in another
 * bridge UI can be tracked here by its L2 transaction hash.
 *
 * viem ships the portal and dispute-game addresses for every OP Stack testnet
 * in our registry, so no addresses are hardcoded here.
 */
const OP_CHAINS: Chain[] = [giwaSepolia, baseSepolia, optimismSepolia, inkSepolia, unichainSepolia, worldchainSepolia];

/** The rollups we can track: in our registry, OP Stack, settling on Ethereum Sepolia. */
export function withdrawalChains(): Chain[] {
  return OP_CHAINS.filter((c) => CHAINS.some((r) => r.id === c.id) && Boolean(c.contracts?.portal) && c.sourceId === sepolia.id);
}

export function withdrawalChain(chainId: number): Chain | undefined {
  return withdrawalChains().find((c) => c.id === chainId);
}

export type WithdrawalStatus = GetWithdrawalStatusReturnType;

export interface WithdrawalProgress {
  status: WithdrawalStatus;
  /** ETH leaving the rollup, wei (sum of the withdrawals in that transaction). */
  amount: bigint;
  /** Seconds until the next action is possible, when the portal can say. */
  secondsUntilReady?: number;
  detail?: string;
}

function rpc(chain: Chain): string {
  return findChain(chain.id)?.rpcUrls[0] ?? chain.rpcUrls.default.http[0]!;
}

function l2Client(chain: Chain) {
  return createPublicClient({ chain, transport: http(rpc(chain), { timeout: 20_000 }) }).extend(publicActionsL2());
}

function l1Client() {
  return createPublicClient({ chain: sepolia, transport: http(rpc(sepolia), { timeout: 25_000 }) }).extend(publicActionsL1());
}

async function receiptFor(chain: Chain, l2TxHash: Hex): Promise<TransactionReceipt> {
  return l2Client(chain).getTransactionReceipt({ hash: l2TxHash });
}

/** What the portal says about one withdrawal transaction right now. */
export async function withdrawalProgress(l2ChainId: number, l2TxHash: Hex): Promise<WithdrawalProgress> {
  const chain = withdrawalChain(l2ChainId);
  if (!chain) throw new Error(`Chain ${l2ChainId} has no tracked rollup withdrawal`);
  const receipt = await receiptFor(chain, l2TxHash);
  const withdrawals = getWithdrawals(receipt);
  if (withdrawals.length === 0) throw new Error("That transaction contains no withdrawal to Ethereum Sepolia");
  const amount = withdrawals.reduce((acc, w) => acc + w.value, 0n);
  const l1 = l1Client();
  const status = await l1.getWithdrawalStatus({ receipt, targetChain: chain as never });
  let secondsUntilReady: number | undefined;
  try {
    if (status === "waiting-to-prove") secondsUntilReady = (await l1.getTimeToProve({ receipt, targetChain: chain as never })).seconds;
    else if (status === "waiting-to-finalize") secondsUntilReady = (await l1.getTimeToFinalize({ withdrawalHash: withdrawals[0]!.withdrawalHash, targetChain: chain as never })).seconds;
  } catch {
    secondsUntilReady = undefined;
  }
  return { status, amount, secondsUntilReady };
}

/** Starts the withdrawal on the rollup (the only step signed on the L2). */
export async function startWithdrawal(config: Config, l2ChainId: number, amountWei: bigint, to: Address): Promise<Hex> {
  const chain = withdrawalChain(l2ChainId);
  if (!chain) throw new Error(`Chain ${l2ChainId} cannot withdraw to Ethereum Sepolia`);
  const wallet = (await getWalletClient(config, { chainId: l2ChainId as never })).extend(walletActionsL2());
  return wallet.initiateWithdrawal({ chain, request: { gas: 21_000n, to, value: amountWei } });
}

/** Proves the withdrawal on Ethereum Sepolia; possible once a dispute game covers the L2 block. */
export async function proveWithdrawal(config: Config, l2ChainId: number, l2TxHash: Hex): Promise<Hex> {
  const chain = withdrawalChain(l2ChainId);
  if (!chain) throw new Error(`Chain ${l2ChainId} has no tracked rollup withdrawal`);
  const receipt = await receiptFor(chain, l2TxHash);
  const l1 = l1Client();
  const [withdrawal] = getWithdrawals(receipt);
  if (!withdrawal) throw new Error("That transaction contains no withdrawal");
  const { output, withdrawal: built } = await l1.waitToProve({ receipt, targetChain: chain as never });
  const args = await l2Client(chain).buildProveWithdrawal({ output, withdrawal: built });
  const wallet = (await getWalletClient(config, { chainId: sepolia.id as never })).extend(walletActionsL1());
  return wallet.proveWithdrawal({ ...args, chain: sepolia, targetChain: chain as never });
}

/** Finalises the withdrawal after the challenge period: the ETH lands on Ethereum Sepolia. */
export async function finalizeWithdrawal(config: Config, l2ChainId: number, l2TxHash: Hex): Promise<Hex> {
  const chain = withdrawalChain(l2ChainId);
  if (!chain) throw new Error(`Chain ${l2ChainId} has no tracked rollup withdrawal`);
  const receipt = await receiptFor(chain, l2TxHash);
  const [withdrawal] = getWithdrawals(receipt);
  if (!withdrawal) throw new Error("That transaction contains no withdrawal");
  const wallet = (await getWalletClient(config, { chainId: sepolia.id as never })).extend(walletActionsL1());
  return wallet.finalizeWithdrawal({ chain: sepolia, targetChain: chain as never, withdrawal });
}

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  "waiting-to-prove": "Waiting for a dispute game",
  "ready-to-prove": "Ready to prove",
  "waiting-to-finalize": "In the challenge period",
  "ready-to-finalize": "Ready to finalise",
  finalized: "Finalised",
};

/** "6d 4h" / "1h 20m" / "2m": the wait is days long, so minutes only matter at the end. */
export function formatWait(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export const formatEth = (wei: bigint) => `${formatEther(wei)} ETH`;
