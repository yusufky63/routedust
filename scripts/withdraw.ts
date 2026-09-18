/**
 * Live check of the rollup withdrawal path with FAUCET_PRIVATE_KEY: starts a
 * small ETH withdrawal on an OP Stack testnet, then reports the portal's status
 * for it (prove/finalise happen days later, from the app).
 *   pnpm exec tsx scripts/withdraw.ts <chainId> <amountEth>
 *   pnpm exec tsx scripts/withdraw.ts status <chainId> <l2TxHash>
 *   pnpm exec tsx scripts/withdraw.ts prove <chainId> <l2TxHash>
 *   pnpm exec tsx scripts/withdraw.ts finalize <chainId> <l2TxHash>
 */
import "./env";
import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia, sepolia } from "viem/chains";
import { getWithdrawals, publicActionsL1, publicActionsL2, walletActionsL1, walletActionsL2 } from "viem/op-stack";

const key = process.env.FAUCET_PRIVATE_KEY!;
const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
const l2 = giwaSepolia;
const l2Public = createPublicClient({ chain: l2, transport: http("https://sepolia-rpc.giwa.io", { timeout: 20000 }) }).extend(publicActionsL2());
const l1Public = createPublicClient({ chain: sepolia, transport: http(undefined, { timeout: 25000 }) }).extend(publicActionsL1());

if (process.argv[2] === "status") {
  const hash = process.argv[4] as Hex;
  const receipt = await l2Public.getTransactionReceipt({ hash });
  const ws = getWithdrawals(receipt);
  console.log(`withdrawals in ${hash}: ${ws.length}, value ${ws.map((w) => formatEther(w.value)).join(",")} ETH`);
  const status = await l1Public.getWithdrawalStatus({ receipt, targetChain: l2 });
  console.log("status:", status);
  if (status === "waiting-to-prove") console.log("time to prove:", (await l1Public.getTimeToProve({ receipt, targetChain: l2 })).seconds, "s");
  if (status === "waiting-to-finalize") console.log("time to finalize:", (await l1Public.getTimeToFinalize({ withdrawalHash: ws[0]!.withdrawalHash, targetChain: l2 })).seconds, "s");
  process.exit(0);
}

if (process.argv[2] === "prove" || process.argv[2] === "finalize") {
  const hash = process.argv[4] as Hex;
  const receipt = await l2Public.getTransactionReceipt({ hash });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(undefined, { timeout: 60000 }) }).extend(walletActionsL1());
  if (process.argv[2] === "prove") {
    const { output, withdrawal } = await l1Public.waitToProve({ receipt, targetChain: l2 });
    const args = await l2Public.buildProveWithdrawal({ output, withdrawal });
    const tx = await wallet.proveWithdrawal({ ...args, targetChain: l2 });
    console.log("prove tx on Sepolia:", tx);
    console.log("receipt:", (await l1Public.waitForTransactionReceipt({ hash: tx })).status);
  } else {
    const [withdrawal] = getWithdrawals(receipt);
    const tx = await wallet.finalizeWithdrawal({ targetChain: l2, withdrawal: withdrawal! });
    console.log("finalize tx on Sepolia:", tx);
    console.log("receipt:", (await l1Public.waitForTransactionReceipt({ hash: tx })).status);
  }
  console.log("status now:", await l1Public.getWithdrawalStatus({ receipt, targetChain: l2 }));
  process.exit(0);
}

const amount = parseEther(process.argv[3] ?? "0.001");
const balance = await l2Public.getBalance({ address: account.address });
console.log(`wallet ${account.address} on ${l2.name}: ${formatEther(balance)} ETH, withdrawing ${formatEther(amount)}`);
if (balance < amount * 2n) throw new Error("not enough L2 ETH");
const wallet = createWalletClient({ account, chain: l2, transport: http("https://sepolia-rpc.giwa.io", { timeout: 30000 }) }).extend(walletActionsL2());
const hash = await wallet.initiateWithdrawal({ request: { gas: 21_000n, to: account.address, value: amount } });
console.log("L2 tx:", hash);
const receipt = await l2Public.waitForTransactionReceipt({ hash });
console.log("mined in block", receipt.blockNumber, "withdrawals:", getWithdrawals(receipt).length);
console.log("status:", await l1Public.getWithdrawalStatus({ receipt, targetChain: l2 }));
console.log("time to prove:", (await l1Public.getTimeToProve({ receipt, targetChain: l2 })).seconds, "s");
