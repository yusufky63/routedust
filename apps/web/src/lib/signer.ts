import { getAccount, getChainId, sendTransaction, signTypedData, switchChain } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Address, Signer } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function isUnknownChainError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = (err as { code?: number })?.code;
  return code === 4902 || /4902|unrecognized chain|unsupported chain|not added|unknown chain|hasn't been added|has not been added|chain not configured/.test(msg);
}

/**
 * Adds the chain to the wallet with the registry's own RPC and explorer
 * (wallet_addEthereumChain), so wallets whose built-in testnet RPC is broken
 * or missing (Rabby, fresh MetaMask profiles) can still sign on it.
 */
export async function addChainToWallet(config: Config, chainId: number): Promise<void> {
  const chain = findChain(chainId);
  if (!chain) throw new Error(`Unknown chain ${chainId}`);
  const provider = (await getAccount(config).connector?.getProvider()) as Eip1193 | undefined;
  if (!provider) throw new Error("No wallet provider available");
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: `0x${chainId.toString(16)}`,
        chainName: chain.name,
        nativeCurrency: { name: chain.nativeAsset.name, symbol: chain.nativeAsset.symbol, decimals: chain.nativeAsset.decimals },
        rpcUrls: chain.rpcUrls,
        blockExplorerUrls: [chain.explorerUrl],
      },
    ],
  });
}

/** Wallet-side signer: every transaction is signed by the connected wallet, nothing leaves the browser. */
export function createWagmiSigner(config: Config, address: Address): Signer {
  return {
    address,
    async getChainId() {
      return getChainId(config);
    },
    async switchChain(chainId) {
      try {
        await switchChain(config, { chainId: chainId as never });
      } catch (err) {
        if (!isUnknownChainError(err)) throw err;
        // The wallet does not know this testnet: add it with our RPC first, then switch again.
        await addChainToWallet(config, chainId);
        await switchChain(config, { chainId: chainId as never });
      }
    },
    async signTypedData(typedData) {
      const params = { account: address, domain: typedData.domain, types: typedData.types, primaryType: typedData.primaryType, message: typedData.message };
      return signTypedData(config, params as never);
    },
    async sendTransaction(tx) {
      return sendTransaction(config, {
        chainId: tx.chainId as never,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gas: tx.gas,
      });
    },
  };
}
