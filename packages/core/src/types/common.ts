export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type SourceKind = "official" | "registry" | "manual" | "runtime";

/**
 * Every important capability or identity carries provenance so the UI can
 * explain where the data came from and when it was last checked.
 */
export interface SourceProvenance {
  kind: SourceKind;
  url: string;
  /** ISO-8601 timestamp. */
  lastVerifiedAt: string;
  note?: string;
}

export type VmKind = "EVM" | "SVM" | "OTHER";
