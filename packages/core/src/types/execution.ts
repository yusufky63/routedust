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
  | "WRONG_CHAIN"
  | "SIMULATION_FAILED"
  | "UNKNOWN";

export interface ExecutionError {
  code: ExecutionErrorCode;
  message: string;
  detail?: string;
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
}

export interface PermitStep extends StepBase {
  type: "PERMIT";
  typedData: unknown;
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
  /** Amount received on destination if known. */
  amountOut?: bigint;
}
