import { CHAIN_IDS } from "./faucets";

/**
 * RouteDust's own gas faucet. One server-side wallet (FAUCET_PRIVATE_KEY)
 * drips the native gas asset on these chains, at most once per cooldown per
 * address and per IP, behind a captcha.
 *
 * Adding a chain: one line here (any chain in CHAINS), or no code at all with
 * FAUCET_AMOUNTS="chainId=amount,…" on the server, which also overrides these
 * amounts; an amount of 0 switches a chain off.
 */
export interface DripChain {
  chainId: number;
  /** Native units per claim, human readable ("0.01" ETH, "1" USDC on Arc). */
  amount: string;
}

export const DRIP_CHAINS: DripChain[] = [
  { chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, amount: "0.01" },
  { chainId: CHAIN_IDS.BASE_SEPOLIA, amount: "0.005" },
  { chainId: CHAIN_IDS.OP_SEPOLIA, amount: "0.005" },
  { chainId: CHAIN_IDS.ARC_TESTNET, amount: "1" },
  { chainId: CHAIN_IDS.GIWA_SEPOLIA, amount: "0.005" },
];

/** One claim per address and per IP per chain within this window. */
export const DRIP_COOLDOWN_HOURS = 24;

/** Upper bound of claims per chain per UTC day, whatever the addresses and IPs (FAUCET_DAILY_CAP overrides). */
export const DRIP_DAILY_CAP = 150;
