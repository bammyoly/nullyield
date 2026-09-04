/**
 * src/lib/zamaEncrypt.js — Zama FHE relayer helpers (encrypt / user-decrypt / public-decrypt)
 * Uses @zama-fhe/relayer-sdk/web.
 */
import { parseUnits } from "viem";

const SEPOLIA_CONFIG = {
  chainId: 11155111,
  gatewayChainId: 10901,
  network:
    import.meta.env.VITE_SEPOLIA_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com",
  relayerUrl:
    import.meta.env.VITE_RELAYER_URL || "https://relayer.testnet.zama.org",
  aclContractAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  inputVerifierContractAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
  verifyingContractAddressDecryption:
    "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
  verifyingContractAddressInputVerification:
    "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
};

const MAX_UINT64 = 18_446_744_073_709_551_615n;

let _instance = null;
let _initPromise = null;
let _sdkReady = false;
let _sdkModule = null;

async function loadSdk() {
  if (_sdkModule) return _sdkModule;
  _sdkModule = await import("@zama-fhe/relayer-sdk/web");
  return _sdkModule;
}

export async function getRelayerInstance() {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const { initSDK, createInstance } = await loadSdk();

    if (typeof initSDK !== "function") {
      throw new Error("initSDK is not a function — Use @zama-fhe/relayer-sdk/web");
    }

    if (!_sdkReady) {
      try {
        await initSDK();
        _sdkReady = true;
      } catch (e) {
        const msg = e.message?.toLowerCase() ?? "";
        if (msg.includes("already initialized")) {
          _sdkReady = true;
        } else {
          throw e;
        }
      }
    }

    const inst = await createInstance(SEPOLIA_CONFIG);
    _instance = inst;
    _initPromise = null;
    return inst;
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });

  return _initPromise;
}

export function resetZamaInstances() {
  _instance = null;
  _initPromise = null;
  _sdkReady = false;
}

const toHex = (buf) =>
  "0x" +
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function normalizeHandle(h) {
  if (typeof h === "bigint") return "0x" + h.toString(16).padStart(64, "0");
  if (typeof h === "string") return "0x" + (h.startsWith("0x") ? h.slice(2) : h).padStart(64, "0");
  if (h instanceof Uint8Array || h instanceof ArrayBuffer) return toHex(h);
  if (h && typeof h === "object" && typeof h.toHexString === "function") return normalizeHandle(h.toHexString());
  if (h && typeof h === "object" && typeof h.toString === "function") return normalizeHandle(h.toString());
  throw new Error(`Unsupported handle type: ${typeof h}`);
}

export async function encryptAmount(amountUsdc, contractAddress, userAddress) {
  if (!userAddress) throw new Error("No wallet address provided for FHE encryption");
  if (!contractAddress) throw new Error("No contract address provided for FHE encryption");

  const instance = await getRelayerInstance();
  const parsed = parseUnits(amountUsdc.toString(), 6);

  if (parsed > MAX_UINT64) throw new Error(`Amount exceeds FHE euint64 maximum limit`);
  if (parsed === 0n) throw new Error("Amount must be greater than 0");

  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(parsed);

  const enc = await input.encrypt();

  if (!enc.handles?.length) throw new Error("FHE encryption returned no valid ciphertext handles");
  
  const rawHandle = enc.handles[0];
  const handleBytes = rawHandle instanceof Uint8Array ? rawHandle : new Uint8Array(rawHandle);

  return {
    handle: toHex(handleBytes),
    proof: toHex(enc.inputProof),
  };
}

export async function decryptHandle(handle, contractAddress, walletClient, userAddress) {
  if (!handle || !contractAddress || !walletClient || !userAddress) throw new Error("Missing decryption arguments");

  const instance = await getRelayerInstance();
  const handleHex = normalizeHandle(handle);
  const keypair = instance.generateKeypair();

  const startTimestamp = Number(Math.trunc(Date.now() / 1000));
  const durationDays = 10;

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    startTimestamp,
    durationDays
  );

  const signature = await walletClient.signTypedData({
    account: userAddress,
    domain: eip712.domain,
    types: { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    primaryType: "UserDecryptRequestVerification",
    message: eip712.message,
  });

  const rawSignature = signature.startsWith("0x") ? signature.slice(2) : signature;

  const result = await instance.userDecrypt(
    [{ handle: handleHex, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    rawSignature,
    [contractAddress],
    userAddress,
    startTimestamp,
    durationDays
  );

  const value = result[handleHex] ?? result[handleHex.toLowerCase()] ?? result[handleHex.toUpperCase()];
  if (value === undefined) throw new Error("Relayer returned no value for this handle. Ensure FHE.allow is set.");

  return BigInt(value);
}

/**
 * Public decrypt for makePubliclyDecryptable handles.
 * @returns {{ clearValue: bigint, proof: string }}
 */
export async function publicDecryptHandle(handle) {
  if (!handle) throw new Error("No ciphertext handle provided");

  const instance = await getRelayerInstance();
  const handleHex = normalizeHandle(handle);

  console.log("[publicDecrypt] handle:", handleHex);

  const result = await instance.publicDecrypt([handleHex]);
  console.log("[publicDecrypt] raw result:", result);

  let value =
    result?.[handleHex] ??
    result?.[handleHex.toLowerCase()] ??
    result?.[handleHex.toUpperCase()];

  if (value === undefined && result?.clearValues) {
    const cv = result.clearValues;
    value =
      cv[handleHex] ??
      cv[handleHex.toLowerCase()] ??
      cv[handleHex.toUpperCase()] ??
      Object.values(cv)[0];
  }

  if (value === undefined && Array.isArray(result) && result.length) {
    value = result[0]?.value ?? result[0];
  }

  if (value === undefined && result && typeof result === "object") {
    const vals = Object.values(result).filter(
      (v) => typeof v === "bigint" || typeof v === "number" || typeof v === "string"
    );
    if (vals.length === 1) value = vals[0];
  }

  if (value === undefined) {
    throw new Error(
      "Public decrypt failed — was the handle marked makePubliclyDecryptable?"
    );
  }

  let proof = "0x";
  if (typeof result?.decryptionProof === "string") proof = result.decryptionProof;
  else if (typeof result?.proof === "string") proof = result.proof;
  else if (result?.decryptionProof instanceof Uint8Array) proof = toHex(result.decryptionProof);

  return {
    clearValue: BigInt(value),
    proof,
  };
}

export { normalizeHandle, SEPOLIA_CONFIG };