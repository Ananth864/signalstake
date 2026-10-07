import { ethers, network, run } from "hardhat";

/**
 * Deploy the SignalStake network.
 *
 * The deployer is the REGULATOR (the regulator bootstraps the network).
 * On localhost it also registers the three demo personas from the unlocked
 * Hardhat accounts: a telco provider, a bank, and a placeholder confirmer.
 *
 * Writes contract addresses to app/src/deployments/<network>.json for the
 * dashboard to consume.
 */

const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");
const PROVIDER_ROLE = ethers.id("PROVIDER_ROLE");
const BANK_ROLE = ethers.id("BANK_ROLE");
const CONFIRMER_ROLE = ethers.id("CONFIRMER_ROLE");

async function main() {
  const [regulator, telco, bank, confirmer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} with regulator ${regulator.address}`);

  const MockSGD = await ethers.getContractFactory("MockSGD");
  const mockSGD = await MockSGD.deploy();

  const ParticipantRegistry = await ethers.getContractFactory("ParticipantRegistry");
  const registry = await ParticipantRegistry.deploy();

  const Settings = await ethers.getContractFactory("Settings");
  const settings = await Settings.deploy();

  const StakeVault = await ethers.getContractFactory("StakeVault");
  const stakeVault = await StakeVault.deploy(await mockSGD.getAddress(), await registry.getAddress(), await settings.getAddress());

  const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
  const signalRegistry = await SignalRegistry.deploy(await registry.getAddress(), await settings.getAddress(), await stakeVault.getAddress());

  const CaseManager = await ethers.getContractFactory("CaseManager");
  const caseManager = await CaseManager.deploy(await signalRegistry.getAddress(), await registry.getAddress(), await stakeVault.getAddress());

  const OutcomeOracle = await ethers.getContractFactory("OutcomeOracle");
  const outcomeOracle = await OutcomeOracle.deploy(await caseManager.getAddress(), await registry.getAddress(), await settings.getAddress());

  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy();

  const RewardPool = await ethers.getContractFactory("RewardPool");
  const rewardPool = await RewardPool.deploy(
    await mockSGD.getAddress(),
    await registry.getAddress(),
    await settings.getAddress(),
    await stakeVault.getAddress(),
    await caseManager.getAddress(),
    await outcomeOracle.getAddress(),
    await reputation.getAddress()
  );

  // Inter-contract wiring: grant the limited roles each contract needs.
  const CASE_MGR_ROLE = ethers.id("CASE_MGR_ROLE");
  const SETTLER_ROLE = ethers.id("SETTLER_ROLE");
  await (await stakeVault.grantRole(CASE_MGR_ROLE, await caseManager.getAddress())).wait();
  await (await stakeVault.grantRole(SETTLER_ROLE, await rewardPool.getAddress())).wait();
  await (await caseManager.grantRole(SETTLER_ROLE, await rewardPool.getAddress())).wait();
  await (await reputation.grantRole(SETTLER_ROLE, await rewardPool.getAddress())).wait();

  // Register demo members (deployer is already the regulator from the constructors).
  const personas: Record<string, string> = { regulator: regulator.address };
  if (network.name === "localhost" || network.name === "hardhat") {
    await (await registry.addMember(telco.address, PROVIDER_ROLE)).wait();
    await (await registry.addMember(bank.address, BANK_ROLE)).wait();
    await (await registry.addMember(confirmer.address, CONFIRMER_ROLE)).wait();
    personas.telco = telco.address;
    personas.bank = bank.address;
    personas.confirmer = confirmer.address;
    console.log(`Members: telco=${telco.address} bank=${bank.address} confirmer=${confirmer.address}`);
  } else {
    // On Sepolia the regulator onboards real members later; only the regulator key is held.
    console.log("Sepolia: register provider/bank/confirmer members later with addMember().");
  }

  const addresses: any = {
    network: network.name === "hardhat" ? "localhost" : network.name,
    chainId: Number(network.config.chainId ?? 31337),
    deployedAt: new Date().toISOString(),
    contracts: {
      MockSGD: await mockSGD.getAddress(),
      ParticipantRegistry: await registry.getAddress(),
      Settings: await settings.getAddress(),
      StakeVault: await stakeVault.getAddress(),
      SignalRegistry: await signalRegistry.getAddress(),
      CaseManager: await caseManager.getAddress(),
      OutcomeOracle: await outcomeOracle.getAddress(),
      Reputation: await reputation.getAddress(),
      RewardPool: await rewardPool.getAddress(),
    },
    personas,
  };
  if (network.name === "sepolia") {
    addresses.rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  }

  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(__dirname, "..", "app", "public");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${addresses.network}.json`);
  fs.writeFileSync(file, JSON.stringify(addresses, null, 2));
  fs.writeFileSync(file, JSON.stringify(addresses, null, 2));
  console.log(`Deployment record written to ${file}`);
  console.log(JSON.stringify(addresses.contracts, null, 2));

  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("Verifying on Etherscan (skips silently if no API key)...");
    for (const [name, address] of Object.entries(addresses.contracts)) {
      try {
        await run("verify:verify", { address });
      } catch {
        /* verification is best-effort */
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
