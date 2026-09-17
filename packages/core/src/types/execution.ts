import type { Address, Hex } from "./common";

export type ExecutionStepType =
  | "APPROVE"
  | "PERMIT"
  | "WRAP"
  | "SWAP"
  | "BRIDGE"
  | "WAIT_ATTESTATION"
  | "CLAIM"
  | "UNWRAP";

export type StepStatus =
  | "PENDING"
  | "READY"
  | "SUBMITTED"
  | "CONFIRMED"
  | "WAITING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type ExecutionErrorCode =
  | "INSUFFICIENT_GAS"
  | "INSUFFICIENT_BALANCE"
  | "QUOTE_EXPIRED"
  | "SLIPPAGE_EXCEEDED"
  | "POOL_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "ATTESTATION_PENDING"
  | "RELAYER_DELAYED"
  | "DESTINATION_FAILED"
  | "USER_REJECTED"
  | "WALLET_DISCONNECTED"
  /** The wallet's nonce moved after this step was handed to it: a transaction may already be out. */
  | "POSSIBLE_DUPLICATE"
  | "WRONG_CHAIN"
  | "SIMULATION_FAILED"
  | "UNKNOWN";

export interface ExecutionError {
  code: ExecutionErrorCode;
  message: string;
  detail?: string;
  /** Chain the error relates to (gas shortfalls, wrong network), for faucet / switch hints. */
  chainId?: number;
}

export interface TxRequest {
  chainId: number;
  to: Address;
  data: Hex;
  value: bigint;
  gas?: bigint;
}

interface StepBase {
  id: string;
  type: ExecutionStepType;
  chainId: number;
  provider: string;
  edgeId: string;
  label: string;
  status: StepStatus;
  txHash?: Hex;
  error?: ExecutionError;
  startedAt?: number;
  completedAt?: number;
}

export interface TxStep extends StepBase {
  type: "APPROVE" | "WRAP" | "SWAP" | "BRIDGE" | "CLAIM" | "UNWRAP";
  tx: TxRequest;
  /** Whether the step should be eth_call-simulated before signing. */
  simulate: boolean;
  /** Quote expiry guard: do not sign past this ms epoch. */
  expiresAt?: number;
  /** Human-readable decode of the call the wallet is asked to sign. */
  summary?: string;
  /** Non-blocking preflight findings (contract code changed, RPC disagreement). */
  warning?: string;
  /** Wallet nonce (pending) when the step was handed to the wallet: a later retry checks it moved. */
  nonce?: number;
  /** Block height when the step was handed to the wallet, for log-based recovery. */
  startBlock?: string;
}

/** EIP-712 payload for a wallet signature (no transaction). */
export interface TypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface PermitStep extends StepBase {
  type: "PERMIT";
  typedData: TypedDataPayload;
  /** Human-readable description of what is being signed. */
  summary?: string;
  /** Set once the wallet signed; also copied into the next wait step's poll payload as `permitSignature`. */
  signature?: Hex;
}

export interface WaitStep extends StepBase {
  type: "WAIT_ATTESTATION";
  /** Provider-specific polling payload. */
  poll: Record<string, unknown>;
  pollIntervalMs: number;
  /** Provider-specific state surfaced to the UI (e.g. attestation status). */
  progress?: string;
}

export type ExecutionStep = TxStep | PermitStep | WaitStep;

export type RouteExecutionState =
  | "PLANNED"
  | "PREFLIGHT"
  | "NEEDS_CHAIN_SWITCH"
  | "NEEDS_APPROVAL"
  | "READY_TO_SIGN"
  | "SOURCE_SUBMITTED"
  | "SOURCE_CONFIRMED"
  | "CROSSCHAIN_PENDING"
  | "DESTINATION_EXECUTING"
  | "COMPLETED"
  /** Wallet disconnected mid-route: nothing failed on-chain, resume when reconnected. */
  | "PAUSED"
  | "FAILED";

export type ProviderStatusKind =
  | "SUBMITTED"
  | "ATTESTED"
  | "FILLED"
  | "MINTED"
  | "COMPLETED"
  | "PENDING"
  | "FAILED";

export interface ExecutionStatus {
  kind: ProviderStatusKind;
  detail?: string;
  destinationTxHash?: Hex;
  /** When true the destination transaction must be submitted by the user. */
  needsClaim?: boolean;
  /** Payload for a claim tx when needsClaim is true. */
  claim?: TxRequest;
  /** Merged into the wait step's poll payload and persisted (ids, attestations obtained while polling). */
  persist?: Record<string, unknown>;
  /**
   * Set with a terminal kind: replaces the payload of the next PERMIT step of
   * the same edge (and merges `poll` into the wait step after it), so what the
   * wallet signs is computed after the wait, not before it.
   */
  nextPermit?: { typedData: TypedDataPayload; summary?: string; poll?: Record<string, unknown> };
  /** Amount received on destination if known. */
  amountOut?: bigint;
}
