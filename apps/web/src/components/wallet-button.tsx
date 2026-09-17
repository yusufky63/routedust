"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@testnet-router/core";
import { Button, useMounted } from "./ui";

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (!mounted) return <Button disabled>Wallet</Button>;

  if (isConnected && address) {
    return (
      <Button onClick={() => disconnect()} title="Disconnect" className="mono">
        {shortAddress(address)}
      </Button>
    );
  }
  const connector = connectors[0];
  return (
    <Button
      variant="accent"
      disabled={!connector}
      busy={isPending}
      onClick={() => connector && connect({ connector })}
      title={connector ? `Connect ${connector.name}` : "No injected wallet found"}
    >
      {isPending ? "Connecting…" : connector ? (
        <>
          Connect<span className="hidden lg:inline">&nbsp;wallet</span>
        </>
      ) : (
        "No wallet"
      )}
    </Button>
  );
}
