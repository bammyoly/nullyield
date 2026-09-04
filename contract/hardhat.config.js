require("dotenv").config(); // Loaded first so process.env is populated
require("@nomicfoundation/hardhat-toolbox");
const rawPrivateKey = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.trim() : "";
const cleanPrivateKey = rawPrivateKey ? `0x${rawPrivateKey.replace(/^0x/i, "")}` : "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,         
      evmVersion: "cancun",
    },
  },

  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      // Uses the safely sanitized private key array
      accounts: cleanPrivateKey ? [cleanPrivateKey] : [],
      chainId: 11155111,
    },
  },

  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};