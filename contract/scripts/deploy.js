const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function syncAbis(targetDir, contractsToSync) {
  ensureDir(targetDir);
  for (const name of contractsToSync) {
    const artifactPath = path.join(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      `${name}.sol`,
      `${name}.json`
    );
    if (!fs.existsSync(artifactPath)) {
      console.warn(`   Warning: artifact missing for ${name}`);
      continue;
    }
    const artifactJson = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    writeJson(path.join(targetDir, `${name}.json`), artifactJson.abi);
    console.log(`   Synced ABI ${name}.json → ${targetDir}`);
  }
}

async function deployBlock(contract) {
  try {
    const deployTx = contract.deploymentTransaction();
    if (!deployTx) return 0;
    const receipt = await deployTx.wait();
    return receipt?.blockNumber ? Number(receipt.blockNumber) : 0;
  } catch (e) {
    console.warn("   deployBlock failed:", e.message);
    return 0;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("Deploying NullYield ecosystem with:", deployer.address);
  console.log("Network chainId:", chainId);

  // ── 1. MockERC20 ──
  console.log("\n1. Deploying MockERC20...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockERC20 = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
  await mockERC20.waitForDeployment();
  const erc20Addr = await mockERC20.getAddress();
  const mockERC20Block = await deployBlock(mockERC20);
  console.log("   MockERC20:", erc20Addr, "| block", mockERC20Block);

  // ── 2. ConfidentialToken ──
  console.log("\n2. Deploying ConfidentialToken...");
  const ConfidentialToken = await ethers.getContractFactory("ConfidentialToken");
  const confidentialToken = await ConfidentialToken.deploy(erc20Addr);
  await confidentialToken.waitForDeployment();
  const confidentialTokenAddr = await confidentialToken.getAddress();
  const confidentialTokenBlock = await deployBlock(confidentialToken);
  console.log("   ConfidentialToken:", confidentialTokenAddr, "| block", confidentialTokenBlock);

  // ── 3. NullYield ──
  console.log("\n3. Deploying NullYield...");
  const PRIZE_PER_DRAW = 100n * 10n ** 6n;
  const DEMO_DRAW_INTERVAL = 300; // 5 minutes for hackathon demos
  const NullYield = await ethers.getContractFactory("NullYield");
  const nullYield = await NullYield.deploy(
    confidentialTokenAddr,
    deployer.address,
    PRIZE_PER_DRAW
  );
  await nullYield.waitForDeployment();
  const nullYieldAddr = await nullYield.getAddress();
  const nullYieldBlock = await deployBlock(nullYield);
  console.log("   NullYield:", nullYieldAddr, "| block", nullYieldBlock);

  await (await nullYield.setDrawInterval(DEMO_DRAW_INTERVAL)).wait();
  console.log("   Draw interval set to", DEMO_DRAW_INTERVAL, "seconds");

  // ── 4. PrizeReserve ──
  console.log("\n4. Deploying PrizeReserve...");
  const DIST_AMOUNT = 100n * 10n ** 6n;
  const DIST_INTERVAL = 300;
  const PrizeReserve = await ethers.getContractFactory("PrizeReserve");
  const prizeReserve = await PrizeReserve.deploy(
    erc20Addr,
    confidentialTokenAddr,
    nullYieldAddr,
    DIST_AMOUNT,
    DIST_INTERVAL,
    deployer.address
  );
  await prizeReserve.waitForDeployment();
  const reserveAddr = await prizeReserve.getAddress();
  const prizeReserveBlock = await deployBlock(prizeReserve);
  console.log("   PrizeReserve:", reserveAddr, "| block", prizeReserveBlock);

  // ── 5. Wire ──
  console.log("\n5. Wiring contracts...");
  await (await nullYield.setPrizeReserve(reserveAddr)).wait();
  console.log("   NullYield.prizeReserveContract → PrizeReserve");

  // ── 6. Seed PrizeReserve (990,000 mUSDC) ──
  console.log("\n6. Seeding PrizeReserve with 990,000 mUSDC...");
  const RESERVE_SEED = 990_000n * 10n ** 6n;
  await (await mockERC20.mint(reserveAddr, RESERVE_SEED)).wait();
  console.log("   PrizeReserve funded (990,000 mUSDC)");

  // ── 7. Mint to Operator/Deployer (10,000 mUSDC) ──
  console.log("\n7. Minting 10,000 mUSDC to operator wallet (Total initial supply = 1,000,000 mUSDC)...");
  const OPERATOR_MINT = 10_000n * 10n ** 6n;
  await (await mockERC20.mint(deployer.address, OPERATOR_MINT)).wait();
  console.log("   Operator funded (10,000 mUSDC)");

  // ── 7b. Optional first distribute ──
  try {
    console.log("\n7b. Attempting initial PrizeReserve.distribute()...");
    await (await prizeReserve.distribute()).wait();
    console.log("   Initial distribute OK");
  } catch (e) {
    console.warn("   Initial distribute skipped:", e.shortMessage || e.message);
  }

  // ── Scan floor: earliest deploy block of the suite ──
  const blockCandidates = [
    mockERC20Block,
    confidentialTokenBlock,
    nullYieldBlock,
    prizeReserveBlock,
  ].filter((b) => b > 0);

  const startBlock =
    blockCandidates.length > 0 ? Math.min(...blockCandidates) : 0;

  const latestBlock = await ethers.provider.getBlockNumber();

  const deploymentData = {
    network: chainId === 11155111 ? "sepolia" : `chain-${chainId}`,
    chainId,
    mockERC20: erc20Addr,
    confidentialToken: confidentialTokenAddr,
    nullYield: nullYieldAddr,
    prizeReserve: reserveAddr,

    startBlock,
    mockERC20Block,
    confidentialTokenBlock,
    nullYieldBlock,
    prizeReserveBlock,
    latestBlockAtDeploy: latestBlock,

    prizePerDraw: PRIZE_PER_DRAW.toString(),
    drawInterval: DEMO_DRAW_INTERVAL,
    distributionAmount: DIST_AMOUNT.toString(),
    distributionInterval: DIST_INTERVAL,
    deployer: deployer.address,
    keeper: deployer.address,
    owner: deployer.address,
    timestamp: new Date().toISOString(),
  };

  console.log("\n════════════════════════════════════════════════");
  console.log("  NULLYIELD — DEPLOYMENT COMPLETE");
  console.log("════════════════════════════════════════════════");
  console.log(JSON.stringify(deploymentData, null, 2));
  console.log("════════════════════════════════════════════════");

  // ── 8. Sync frontend ──
  console.log("\n8. Syncing addresses + ABIs to frontend...");

  writeJson(path.join(__dirname, "..", "deployment.json"), deploymentData);

  const contractsToSync = ["MockERC20", "ConfidentialToken", "NullYield", "PrizeReserve"];

  const frontendDir = path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "src",
    "contracts"
  );
  try {
    ensureDir(frontendDir);
    writeJson(path.join(frontendDir, "addresses.json"), deploymentData);
    syncAbis(frontendDir, contractsToSync);
    console.log("   ✓ frontend/src/contracts/");
  } catch (err) {
    console.error("   Frontend sync failed:", err.message);
  }

  console.log("\n🚀 Deploy + sync done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });