import type { Hex } from "@testnet-router/core";

/**
 * keccak256 of the deployed bytecode of every contract the wallet signs
 * against (spenders, routers, bridges), keyed by "chainId:address"
 * (lower-case). Verified on-chain at the registry snapshot with
 * `scripts/codehash.ts`. The executor compares before every signature and
 * warns when a contract's code changed (proxy upgrade, redeployment).
 */
export const KNOWN_CODE_HASHES: Record<string, Hex> = {
  "11155111:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Sepolia
  "11155111:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Sepolia
  "43113:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Fuji
  "43113:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Fuji
  "11155420:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · OP
  "11155420:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · OP
  "421614:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Arbitrum
  "421614:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Arbitrum
  "84532:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Base
  "84532:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Base
  "80002:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Amoy
  "80002:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Amoy
  "1301:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Unichain
  "1301:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Unichain
  "59141:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Linea
  "59141:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Linea
  "14601:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Sonic
  "14601:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Sonic
  "4801:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · World
  "4801:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · World
  "10143:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Monad
  "10143:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Monad
  "1328:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Sei
  "1328:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Sei
  "763373:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Ink
  "763373:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Ink
  "98867:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Plume
  "98867:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Plume
  "5042002:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Arc
  "5042002:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Arc
  "1439:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Injective
  "1439:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Injective
  "338:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Cronos
  "338:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Cronos
  "9746:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · Plasma
  "9746:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · Plasma
  "1952:0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // TokenMessengerV2 · X Layer
  "1952:0xe737e5cebeeba77efe34d4aa090756590b1ce275": "0xd2c8d48075d832fb7d07f6db5545a1bee37fdf886325c441a8dd1cef4c9dae99", // MessageTransmitterV2 · X Layer
  "11155111:0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e": "0xe7f98ee73dfe6d5c96cbf8936920f496b1b82f24326d6a415b4144a2252271de", // SwapRouter02 · Sepolia
  "11155111:0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b": "0x14f7c9253a5406bafa90cb512f4a2db2a10513886603e7a9b4a2e72329e944f4", // UniversalRouter · Sepolia
  "11155111:0x000000000022d473030f116ddee9f6b43ac78ba3": "0x96d9f5c3f0fb0423426b7f970186235b7347027f4e5c19c40c412b7d97fc3751", // Permit2 · Sepolia
  "84532:0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4": "0x60e9352f5af4eee63b41456f85bf80c63044e98123ad599d41d87f2d068de0be", // SwapRouter02 · Base
  "84532:0x492e6456d9528771018deb9e87ef7750ef184104": "0x952c879f642706a4d399eb917827b5a2a5519328446dba72aef3579909bf15ef", // UniversalRouter · Base
  "84532:0x000000000022d473030f116ddee9f6b43ac78ba3": "0xdcde65555316946c298e4c60c6213eb5c3aeab4354d1f3fac5427236bcbb9ebe", // Permit2 · Base
  "43113:0x2d99abd9008dc933ff5c0cd271b88309593ab921": "0x0f854ecff24dd6b821c6474f0aa6b07391da504ce0ae359f4d2b5ea8eb613cb8", // Pangolin router · Fuji
  "43113:0x688d21b0b8dc35971af58cff1f7bf65639937860": "0xd42b100674d73be6d26f1805b46f4c701d8d4246bc087477f69cdd7b93ef5189", // Pangolin (app deployment) router · Fuji
  "43113:0xd7f655e3376ce2d7a2b08ff01eb3b1023191a901": "0x39662f9f118c51d6631b95f4ccf715b9374589a8ed4d90eec1641c37b16eb047", // LFJ v1 router · Fuji
  "11155111:0x352f1c7ffa598d0698c1d8d2fcab02511c6ff3e9": "0x12d65d137a79c184284b3b740ec6ccfc153fae6b7e34153a21cd793ddd8f9d9f", // Hyperlane usdc-testnet-cctp · Sepolia
  "84532:0x020dee96414703c457322eed8504946583a7dd24": "0x12d65d137a79c184284b3b740ec6ccfc153fae6b7e34153a21cd793ddd8f9d9f", // Hyperlane usdc-testnet-cctp · Base
  "11155420:0xb0a06a5f47d335f5d94d4d8620bcadf320a159ac": "0x12d65d137a79c184284b3b740ec6ccfc153fae6b7e34153a21cd793ddd8f9d9f", // Hyperlane usdc-testnet-cctp · OP
  "421614:0x61714300b991cfc2bd336cb1745f01463163a988": "0x12d65d137a79c184284b3b740ec6ccfc153fae6b7e34153a21cd793ddd8f9d9f", // Hyperlane usdc-testnet-cctp · Arbitrum
  "11155111:0xe0f3680b09751b965cfa24f02f5aa58f0e12343a": "0x536a9c2400938a6a75cb3661f13e044171fd433531e5a502ba3fa145bf6bcb6d", // Hyperlane usdc-testnet-cctp-v2-fast · Sepolia
  "421614:0x7f37ca42a1a39f736339ce12fc2eb8e9ea88ffe5": "0x536a9c2400938a6a75cb3661f13e044171fd433531e5a502ba3fa145bf6bcb6d", // Hyperlane usdc-testnet-cctp-v2-fast · Arbitrum
  "421614:0xbfce950a54a2052aec323c8884f034373ca9cabd": "0x33931281671f898cf8a47a09448a435833c9cd31a21654081f4bb2bba6806f46", // Hyperlane usdc-arbitrumsepolia-basesepolia-cctp-v2 · Arbitrum
  "84532:0x6ad4f1ccbb4e897efbbb2a62c7ccbbd7fe941848": "0x33931281671f898cf8a47a09448a435833c9cd31a21654081f4bb2bba6806f46", // Hyperlane usdc-arbitrumsepolia-basesepolia-cctp-v2 · Base
  "11155111:0xfbb0621e0b23b5478b630bd55a5f21f67730b0f1": "0xc7b46fc754979c0fd29ec7105b045a5705d172da4364b24a72e42e586906056f", // L1StandardBridge → OP · Sepolia
  "11155111:0xfd0bf71f60660e2f608ed56e1659c450eb113120": "0xc7b46fc754979c0fd29ec7105b045a5705d172da4364b24a72e42e586906056f", // L1StandardBridge → Base · Sepolia
  "11155111:0x77b2ffc0f57598cae1db76cb398059cf5d10a7e7": "0xc7b46fc754979c0fd29ec7105b045a5705d172da4364b24a72e42e586906056f", // L1StandardBridge → GIWA · Sepolia
  "11155111:0x33f60714bbd74d62b66d79213c348614de51901c": "0xc7b46fc754979c0fd29ec7105b045a5705d172da4364b24a72e42e586906056f", // L1StandardBridge → Ink · Sepolia
};
