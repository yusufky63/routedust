import { getChainId, sendTransaction, switchChain } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Address, Signer } from "@testnet-router/core";

/** Wallet-side signer: every transaction is signed by the connected wallet, nothing leaves the browser. */
export function createWagmiSigner(config: Config, address: Address): Signer {
  return {
    address,
    async getChainId() {
      return getChainId(config);
    },
    async switchChain(chainId) {
      await switchChain(config, { chainId: chainId as never });
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
