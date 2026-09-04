/**
 * src/hooks/useZamaEncrypt.js — React hook over zamaEncrypt.js
 */
import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  getRelayerInstance,
  resetZamaInstances,
  encryptAmount as _encryptAmount,
  decryptHandle as _decryptHandle,
  publicDecryptHandle as _publicDecryptHandle,
} from "../lib/zamaEncrypt";

const SEPOLIA_CHAIN_ID = 11155111;

export function useZamaEncrypt() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSdkError("");
    setSdkReady(false);

    getRelayerInstance()
      .then(() => {
        if (!cancelled) {
          setSdkReady(true);
          setSdkError("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSdkError(e.message ?? "FHE SDK failed to initialize");
          setSdkReady(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!chainId) return;

    if (chainId !== SEPOLIA_CHAIN_ID) {
      resetZamaInstances();
      setSdkReady(false);
      setSdkError("Switch to Ethereum Sepolia (chainId 11155111) to use FHE.");
      return;
    }

    let cancelled = false;
    setSdkError("");

    getRelayerInstance()
      .then(() => {
        if (!cancelled) {
          setSdkReady(true);
          setSdkError("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSdkError(e.message ?? "FHE SDK failed to initialize");
          setSdkReady(false);
        }
      });

    return () => { cancelled = true; };
  }, [chainId]);

  const encryptAmount = useCallback(
    async (amountUsdc, contractAddress) => {
      if (!isConnected) throw new Error("Wallet not connected");
      if (!address) throw new Error("No wallet address found");
      return _encryptAmount(amountUsdc, contractAddress, address);
    },
    [address, isConnected]
  );

  const decryptHandle = useCallback(
    async (handle, contractAddress) => {
      if (!isConnected) throw new Error("Wallet not connected");
      if (!address) throw new Error("No wallet address found");
      if (!walletClient) throw new Error("Wallet client not ready");
      return _decryptHandle(handle, contractAddress, walletClient, address);
    },
    [address, isConnected, walletClient]
  );

  const publicDecryptHandle = useCallback(
    async (handle) => _publicDecryptHandle(handle),
    []
  );

  return {
    encryptAmount,
    decryptHandle,
    publicDecryptHandle,
    sdkReady,
    sdkError,
  };
}