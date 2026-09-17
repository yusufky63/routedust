/**
 * Live check of Circle Gateway multi-source burn intent sets.
 *
 * 1. /v1/estimate: a set over several source domains vs. the same intents one
 *    by one (the forwarding fee is charged once per request).
 * 2. Signature check: a throwaway key generated here (never funded, never
 *    stored) signs a single intent and a set exactly as the adapter builds
 *    them and posts both to /v1/transfer. Circle verifies the EIP-712
 *    signature before balances, so "insufficient balance" means the typed data
 *    and request shape are right; a signature error means they are not.
 *
 *   pnpm exec tsx scripts/gateway-set.ts
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { GATEWAY_EIP712_TYPES, sizeGatewaySet } from "@testnet-router/providers";
import { CCTP_DOMAINS, CIRCLE_GATEWAY_TESTNET, findChain, usdcAsset } from "@testnet-router/registry";
import type { Address } from "@testnet-router/core";

const account = privateKeyToAccount(generatePrivateKey());
const token = (chainId: number) => (usdcAsset(chainId)?.address ?? findChain(chainId)?.nativeAsset.erc20Mirror?.address) as Address;
const domain = (chainId: number) => CCTP_DOMAINS.find((d) => d.chainId === chainId)!.domain;

const [dst, ...rest] = CIRCLE_GATEWAY_TESTNET.chainIds;
const sources = rest.slice(0, 5).map((chainId, i) => ({ chainId, domain: domain(chainId), token: token(chainId), amount: BigInt(8 - i) * 1_000_000n }));

const sizing = await sizeGatewaySet({ fetch, wallet: account.address, recipient: account.address, destinationDomain: domain(dst!), destinationToken: token(dst!), sources });
if (!sizing) throw new Error("estimate failed");
console.log(`set of ${sizing.intents.length} → ${findChain(dst!)?.shortName}: in ${sizing.totalIn} out ${sizing.totalOut} fee ${sizing.totalFee} (forwarding ${sizing.forwardingFee}, charged once)`);
for (const i of sizing.intents) console.log(`  domain ${i.spec.sourceDomain}: value ${i.spec.value} maxFee ${i.maxFee}`);

const message = (i: (typeof sizing.intents)[number]) => ({ maxBlockHeight: BigInt(i.maxBlockHeight), maxFee: BigInt(i.maxFee), spec: { ...i.spec, value: BigInt(i.spec.value) } });
const eip712Domain = { name: CIRCLE_GATEWAY_TESTNET.eip712.name, version: CIRCLE_GATEWAY_TESTNET.eip712.version };

async function post(label: string, body: unknown) {
  const res = await fetch(`${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/transfer?enableForwarder=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  console.log(`${label} → HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const { BurnIntentSet: _unused, ...singleTypes } = GATEWAY_EIP712_TYPES;
const single = sizing.intents[0]!;
await post("single intent", [{ burnIntent: single, signature: await account.signTypedData({ domain: eip712Domain, types: singleTypes, primaryType: "BurnIntent", message: message(single) }) }]);
await post("intent set", [
  { burnIntentSet: { intents: sizing.intents }, signature: await account.signTypedData({ domain: eip712Domain, types: GATEWAY_EIP712_TYPES, primaryType: "BurnIntentSet", message: { intents: sizing.intents.map(message) } }) },
]);
await post("intent set, deliberately wrong signer", [
  { burnIntentSet: { intents: sizing.intents }, signature: await privateKeyToAccount(generatePrivateKey()).signTypedData({ domain: eip712Domain, types: GATEWAY_EIP712_TYPES, primaryType: "BurnIntentSet", message: { intents: sizing.intents.map(message) } }) },
]);
