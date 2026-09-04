//src/config/wagmi.js

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error(
    "Missing VITE_WALLETCONNECT_PROJECT_ID in .env"
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "NullYield",
  projectId,
  chains: [sepolia],
  ssr: false,
});