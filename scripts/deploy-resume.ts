import { ethers, network } from "hardhat";
import type { ContractTransactionResponse } from "ethers";

/**
 * One-off RESUME script for the interrupted Sepolia deployment.
 *
 * Five contracts are already live (nonces 4-8); this deploys the remaining
 * four against those addresses, grants the inter-contract roles, and writes
 * the deployment record for the dashboard. Gas limits are pinned at ~2x the
 * measured local gas because Sepolia's creation gas runs higher than the
 * local network's (observed: MockSGD reverted at 1.25x local).
 *
 * Live addresses from the earlier runs:
 *   MockSGD             0xd8906ca998517543C6Ff2302B6F0DFDF88B3281d
 *   ParticipantRegistry 0x5f1e3b44A179Efd19E183d44bEEDFF980072ba76
 *   Settings            0xb325b99789fF702c26288cDC86c64aDe9366CFd3
 *   StakeVault          0xC5202c8827fD38F7438409211e9CC3c2e9177Cf4
 *   SignalRegistry      0x44995e9A9BfFaFA875486385B828C24e54f3061D
 */

const CASE_MGR_ROLE = ethers.id("CASE_MGR_ROLE");
const SETTLER_ROLE = ethers.id("SETTLER_ROLE");

const LIVE = {
  MockSGD: "0xd8906ca998517543C6Ff2302B6F0DFDF88B3281d",
  ParticipantRegistry: "0x5f1e3b44A179Efd19E183d44bEEDFF980072ba76",
  Settings: "0xb325b99789fF702c26288cDC86c64aDe9366CFd3",
  StakeVault: "0xC5202c8827fD38F7438409211e9CC3c2e9177Cf4",
  SignalRegistry: "0x44995e9A9BfFaFA875486385B828C24e54f3061D",
} as const;

const FEE = {
  maxFeePerGas: ethers.parseUnits("0.8", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("0.4", "gwei"),
};

async function main() {
  if (network.name !== "sepolia") throw new Error("resume script is Sepolia-only");
  const [regulator] = await ethers.getSigners();
  console.log(`Resuming Sepolia deployment with regulator ${regulator.address}`);

  let nonce = await ethers.provider.getTransactionCount(regulator.address, "latest");
  const nextNonce = () => nonce++;

  async function deploy(name: string, ...args: unknown[]) {
    const f = await ethers.getContractFactory(name);
    const createTx = await f.getDeployTransaction(...args);
    // Sepolia executes creations at several x local gas; ask the node for the
    // real number (it simulates the run) and pad it by 20%.
    const est = await ethers.provider.estimateGas({ from: regulator.address, data: createTx.data });
    const gasLimit = (est * 12n) / 10n;
    const sent = await regulator.sendTransaction({
      ...createTx, nonce: nextNonce(), ...FEE, gasLimit,
    });
    const receipt = await sent.wait();
    if (receipt?.status !== 1) throw new Error(`${name} failed (gasUsed ${receipt?.gasUsed})`);
    console.log(`  ${name}: ${receipt.contractAddress} (gasUsed ${receipt.gasUsed}, limit ${gasLimit})`);
    return ethers.getContractAt(name, receipt!.contractAddress!);
  }

  async function callAndWait(txPromise: Promise<ContractTransactionResponse>, label: string) {
    const sent = await txPromise;
    const receipt = await sent.wait();
    if (receipt?.status !== 1) throw new Error(`${label} failed`);
    console.log(`  ${label} ok`);
  }

  const caseManager = await deploy("CaseManager", LIVE.SignalRegistry, LIVE.ParticipantRegistry, LIVE.StakeVault);
  const outcomeOracle = await deploy("OutcomeOracle", await caseManager.getAddress(), LIVE.ParticipantRegistry, LIVE.Settings);
  const reputation = await deploy("Reputation");
  const rewardPool = await deploy("RewardPool", LIVE.MockSGD, LIVE.ParticipantRegistry, LIVE.Settings,
    LIVE.StakeVault, await caseManager.getAddress(), await outcomeOracle.getAddress(), await reputation.getAddress());

  await callAndWait((await ethers.getContractAt("StakeVault", LIVE.StakeVault))
    .grantRole(CASE_MGR_ROLE, await caseManager.getAddress(), { nonce: nextNonce(), ...FEE }), "StakeVault.CASE_MGR_ROLE");
  await callAndWait((await ethers.getContractAt("StakeVault", LIVE.StakeVault))
    .grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }), "StakeVault.SETTLER_ROLE");
  await callAndWait(caseManager
    .grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }), "CaseManager.SETTLER_ROLE");
  await callAndWait(reputation
    .grantRole(SETTLER_ROLE, await rewardPool.getAddress(), { nonce: nextNonce(), ...FEE }), "Reputation.SETTLER_ROLE");

  const addresses = {
    network: "sepolia",
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
    contracts: {
      MockSGD: LIVE.MockSGD,
      ParticipantRegistry: LIVE.ParticipantRegistry,
      Settings: LIVE.Settings,
      StakeVault: LIVE.StakeVault,
      SignalRegistry: LIVE.SignalRegistry,
      CaseManager: await caseManager.getAddress(),
      OutcomeOracle: await outcomeOracle.getAddress(),
      Reputation: await reputation.getAddress(),
      RewardPool: await rewardPool.getAddress(),
    },
    personas: { regulator: regulator.address },
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  };

  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = path.join(__dirname, "..", "app", "public", "sepolia.json");
  fs.writeFileSync(file, JSON.stringify(addresses, null, 2));
  console.log(`Deployment record written to ${file}`);
  console.log(JSON.stringify(addresses.contracts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
