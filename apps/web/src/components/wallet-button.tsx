"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@testnet-router/core";
import { Button, useMounted } from "./ui";

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (!mounted) return <Button disabled>WALLET</Button>;

  if (isConnected && address) {
    return (
      <Button onClick={() => disconnect()} title="Disconnect">
        {shortAddress(address)}
      </Button>
    );
  }
  const connector = connectors[0];
  return (
    <Button
      variant="accent"
      disabled={!connector || isPending}
      onClick={() => connector && connect({ connector })}
      title={connector ? `Connect ${connector.name}` : "No injected wallet found"}
    >
      {isPending ? "CONNECTING" : connector ? "CONNECT" : "NO WALLET"}
    </Button>
  );
}
