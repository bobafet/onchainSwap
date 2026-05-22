import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

// Arc Testnet — custom chain definition
// Chain ID: 5042002 | RPC: rpc.testnet.arc.network | Explorer: testnet.arcscan.app
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

// wagmi config — connects RainbowKit wallets to Arc network
// WalletConnect projectId: get a free one at https://cloud.walletconnect.com
export const wagmiConfig = getDefaultConfig({
  appName: "onchainGM",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [arcTestnet],
  ssr: false,
});
