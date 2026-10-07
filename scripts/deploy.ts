import { ethers, network, run } from "hardhat";
import type { ContractFactory, ContractTransactionResponse } from "ethers";

/**
 * Deploy the SignalStake network.
 *
 * The deployer is the REGULATOR (the regulator bootstraps the network).
 * On localhost it also registers the three demo personas from the unlocked
 * Hardhat accounts: a telco provider, a bank, and a placeholder confirmer.
 *
 * Writes contract addresses to app/public/<network>.json for the dashboard.
 *
 * Public RPCs serve a stale `pending` nonce, so every transaction here uses
 * an explicit, locally-tracked nonce and explicit fees instead of letting
 * ethers re-query the node between sends.
 */

const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");
const PROVIDER_ROLE = ethers.id("PROVIDER_ROLE");
const BANK_ROLE = ethers.id("BANK_ROLE");
const CONFIRMER_ROLE = ethers.id("CONFIRMER_ROLE");
const CASE_MGR_ROLE = ethers.id("CASE_MGR_ROLE");
const SETTLER_ROLE = ethers.id("SETTLER_ROLE");

// Sepolia's base fee sits near zero; a 1.5 gwei cap / 1 gwei tip is generous
// there and keeps the node's prefund check (cap x gas) inside a faucet budget.
// Public RPCs overestimate creation gas ~2x, so gas limits are pinned from
// measured mainnet-equivalent deployments (see git history for the numbers).
const FEE = {
  maxFeePerGas: ethers.parseUnits("1.5", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
};

const GAS_LIMITS: Record<string, bigint> = {
  MockSGD: 984330n,
  ParticipantRegistry: 796303n,
  Settings: 686899n,
  StakeVault: 1385439n,
  SignalRegistry: 826449n,
  CaseManager: 1218588n,
  OutcomeOracle: 1308783n,
  Reputation: 569196n,
  RewardPool: 1391735n,
};

async function main() {
  const [regulator, telco, bank, confirmer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} with regulator ${regulator.address}`);

  let nonce = await ethers.provider.getTransactionCount(regulator.address, "latest");
  const nextNonce = () => nonce++;

  /** Deploy a contract with an explicit nonce; returns a typed contract. */
  async function deploy(name: string, factory: ContractFactory, ...args: unknown[]) {
    const createTx = await factory.getDeployTransaction(...args);
    const gasLimit = GAS_LIMITS[name];
    const sent = await regulator.sendTransaction({
      ...createTx, nonce: nextNonce(), ...FEE,
      ...(gasLimit ? { gasLimit } : {}),
    });
    const receipt = await sent.wait();
    if (receipt?.status !== 1) throw new Error(`deployment of ${name} failed`);
    console.log(`  ${name}: ${receipt.contractAddress} (nonce ${nonce - 1})`);
    return ethers.getContractAt(name, receipt!.contractAddress!);
  }

  /** Send a contract call with an explicit nonce and wait for it to mine. */
  async function callAndWait(txPromise: Promise<ContractTransactionResponse>) {
    const sent = await txPromise;
    const receipt = await sent.wait();
    if (receipt?.status !== 1) throw new Error(`transaction ${sent.hash} failed`);
  }

  const mockSGD = await deploy("MockSGD", await ethers.getContractFactory("MockSGD"));
  const registry = await deploy("ParticipantRegistry", await ethers.getContractFactory("ParticipantRegistry"));
  const settings = await deploy("Settings", await ethers.getContractFactory("Settings"));
  const stakeVault = await deploy("StakeVault", await ethers.getContractFactory("StakeVault"),
    await mockSGD.getAddress(), await registry.getAddress(), await settings.getAddress());
  const signalRegistry = await deploy("SignalRegistry", await ethers.getContractFactory("SignalRegistry"),
    await registry.getAddress(), await settings.getAddress(), await stakeVault.getAddress());
  const caseManager = await deploy("CaseManager", await ethers.getContractFactory("CaseManager"),
    await signalRegistry.getAddress(), await registry.getAddress(), await stakeVault.getAddress());
  const outcomeOracle = await deploy("OutcomeOracle", await ethers.getContractFactory("OutcomeOracle"),
    await caseManager.getAddress(), await registry.getAddress(), await settings.getAddress());
  const reputation = await deploy("Reputation", await ethers.getContractFactory("Reputation"));
  const rewardPool = await deploy("RewardPool", await ethers.getContractFactory("RewardPool"),
    await mockSGD.getAddress(), await registry.getAddress(), await settings.getAddress(),
    await stakeVault.getAddress(), await caseManager.getAddress(), await outcomeOracle.getAddress(),
    await reputation.getAddress());

  // Inter-contract wiring: grant the limited roles each contract needs.
  await callAndWait(stakeVault.grantRole(CASE_MGR_ROLE, await caseManager.getAddress(), { nonce: nextNonce(), ...FEE }));
  await callAndWait(stakeVault.grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }));
  await callAndWait(caseManager.grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }));
  await callAndWait(reputation.grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }));

  // Register demo members (deployer is already the regulator from the constructors).
  const personas: Record<string, string> = { regulator: regulator.address };
  if (network.name === "localhost" || network.name === "hardhat") {
    await callAndWait(registry.addMember(telco.address, PROVIDER_ROLE, { nonce: nextNonce(), ...FEE }));
    await callAndWait(registry.addMember(bank.address, BANK_ROLE, { nonce: nextNonce(), ...FEE }));
    await callAndWait(registry.addMember(confirmer.address, CONFIRMER_ROLE, { nonce: nextNonce(), ...FEE }));
    personas.telco = telco.address;
    personas.bank = bank.address;
    personas.confirmer = confirmer.address;
    console.log(`Members: telco=${telco.address} bank=${bank.address} confirmer=${confirmer.address}`);
  } else {
    console.log("Sepolia: register provider/bank/confirmer members later with addMember().");
  }

  const addresses = {
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
  console.log(`Deployment record written to ${file}`);
  console.log(JSON.stringify(addresses.contracts, null, 2));

  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("Etherscan verification is skipped unless ETHERSCAN_API_KEY is set (free at etherscan.io).");
    if (process.env.ETHERSCAN_API_KEY) {
      for (const [name, address] of Object.entries(addresses.contracts)) {
        try {
          await run("verify:verify", { address });
          console.log(`  verified ${name}`);
        } catch (e) {
          console.log(`  verify ${name}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
