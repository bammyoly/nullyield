import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "./config/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const customRainbowTheme = darkTheme({
  accentColor: "#f0b429",
  accentColorForeground: "#0a0a0f",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={customRainbowTheme}>
            <App />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </StrictMode>,
)
