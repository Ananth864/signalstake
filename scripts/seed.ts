import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Seed demo data.
 *
 * localhost: mint MockSGD to the personas, stake the telco's deposit, fund
 * the bank's reward pool, and post one "Mdm Tan" signal whose warning
 * details are written to app/public/offchain-seed.json - the file the
 * dashboard's simulated off-chain channel preloads.
 *
 * sepolia: only regulator-actionable steps run (minting); staking and
 * funding need the member keys, which are not held here.
 */

const PROVIDER_ROLE = ethers.id("PROVIDER_ROLE");
const BANK_ROLE = ethers.id("BANK_ROLE");

const SGD = (n: number) => ethers.parseEther(String(n));

function loadDeployment(net: string) {
  const file = join(__dirname, "..", "app", "public", `${net}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  const net = network.name === "hardhat" ? "localhost" : network.name;
  const dep = loadDeployment(net);
  const c = dep.contracts as Record<string, string>;
  const [regulator, telco, bank] = await ethers.getSigners();

  const mockSGD = await ethers.getContractAt("MockSGD", c.MockSGD);
  const registry = await ethers.getContractAt("ParticipantRegistry", c.ParticipantRegistry);
  const settings = await ethers.getContractAt("Settings", c.Settings);
  const stakeVault = await ethers.getContractAt("StakeVault", c.StakeVault);
  const signalRegistry = await ethers.getContractAt("SignalRegistry", c.SignalRegistry);
  const rewardPool = await ethers.getContractAt("RewardPool", c.RewardPool);

  const p = await settings.params();
  console.log(`Settings: reward=${ethers.formatEther(p.reward)} slash=${ethers.formatEther(p.slashAmount)} minStake=${ethers.formatEther(p.minStake)}`);

  // Regulator mints test SGD (deployer holds MINTER_ROLE).
  await (await mockSGD.mint(regulator.address, SGD(100_000))).wait();

  if (net !== "localhost") {
    console.log("Sepolia: regulator funded with MockSGD. Stake, fund the pool and post signals from the member accounts (dashboard or cast).");
    return;
  }

  // Distribute, stake, and fund.
  await (await mockSGD.mint(telco.address, SGD(10_000))).wait();
  await (await mockSGD.mint(bank.address, SGD(10_000))).wait();
  if (!(await registry.hasRole(PROVIDER_ROLE, telco.address))) {
    await (await registry.addMember(telco.address, PROVIDER_ROLE)).wait();
  }
  if (!(await registry.hasRole(BANK_ROLE, bank.address))) {
    await (await registry.addMember(bank.address, BANK_ROLE)).wait();
  }
  await (await mockSGD.connect(telco).approve(c.StakeVault, SGD(500))).wait();
  await (await stakeVault.connect(telco).depositStake(SGD(500))).wait();
  await (await mockSGD.connect(bank).approve(c.RewardPool, SGD(2_000))).wait();
  await (await rewardPool.connect(bank).fundPool(SGD(2_000))).wait();
  console.log("Telco staked 500 SGD; bank pool funded with 2,000 SGD.");

  // Post the demo signal: commitment over secret nonce + warning details.
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const details = JSON.stringify({
    scenario: "mdm-tan",
    risk: "Customer on 20-minute call with a number linked to a fake government official scam",
    transferAmount: "S$40,000",
    paymentRef: "XFER-88123",
  });
  const commitHash = ethers.keccak256(ethers.toUtf8Bytes(nonce + details));
  const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(p.signalTTL));
  await (await signalRegistry.connect(telco).postSignal(commitHash, 0, expiry)).wait();

  const seedDir = join(__dirname, "..", "app", "public");
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(
    join(seedDir, "offchain-seed.json"),
    JSON.stringify({ signals: [{ commitHash, nonce, details }] }, null, 2)
  );
  console.log("Demo signal posted; off-chain details written to app/public/offchain-seed.json.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
