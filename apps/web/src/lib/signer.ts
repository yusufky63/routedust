import { getChainId, sendTransaction, signTypedData, switchChain } from "wagmi/actions";
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
