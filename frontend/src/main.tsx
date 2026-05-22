import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import App from "./App.tsx";
import { wagmiConfig } from "./wagmi.ts";

// QueryClient manages blockchain data caching (stale time, refetching, etc.)
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* WagmiProvider: makes wallet/chain hooks available everywhere */}
    <WagmiProvider config={wagmiConfig}>
      {/* QueryClientProvider: caches blockchain reads so we don't spam RPC */}
      <QueryClientProvider client={queryClient}>
        {/* RainbowKitProvider: the "Connect Wallet" button & modal */}
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#00d4aa",
            accentColorForeground: "#080b14",
            borderRadius: "large",
            fontStack: "system",
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
