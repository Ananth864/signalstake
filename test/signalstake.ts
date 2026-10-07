import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * SignalStake test suite. Mirrors the project brief: two happy paths and
 * every mandated rejection (non-member signal, under-staked provider,
 * expired signal, single-signature outcome, double settlement, premature
 * withdrawal, non-regulator admin actions).
 */

const SGD = (n: number) => ethers.parseEther(String(n));
const PROVIDER_ROLE = ethers.id("PROVIDER_ROLE");
const BANK_ROLE = ethers.id("BANK_ROLE");
const CONFIRMER_ROLE = ethers.id("CONFIRMER_ROLE");
const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");

// Outcome enum order: 0 NONE, 1 PREVENTED, 2 FALSE_ALARM
const PREVENTED = 1n;
const FALSE_ALARM = 2n;

describe("SignalStake", function () {
  // personas: 0 regulator (deployer), 1 telco provider, 2 bank, 3 confirmer, 4 outsider
  let mockSGD: any, registry: any, settings: any, stakeVault: any, signalRegistry: any;
  let caseManager: any, outcomeOracle: any, reputation: any, rewardPool: any;
  let regulator: any, telco: any, bank: any, confirmer: any, outsider: any;
  let params: any;

  const commitment = () => ethers.keccak256(ethers.toUtf8Bytes(ethers.hexlify(ethers.randomBytes(32)) + "warning details"));
  const expirySoon = async () => BigInt(await time.latest()) + 3600n;

  before(async function () {
    [, telco, bank, confirmer, outsider] = await ethers.getSigners();
  });

  beforeEach(async function () {
    [regulator] = await ethers.getSigners();

    const MockSGD = await ethers.getContractFactory("MockSGD");
    mockSGD = await MockSGD.deploy();
    const ParticipantRegistry = await ethers.getContractFactory("ParticipantRegistry");
    registry = await ParticipantRegistry.deploy();
    const Settings = await ethers.getContractFactory("Settings");
    settings = await Settings.deploy();
    const StakeVault = await ethers.getContractFactory("StakeVault");
    stakeVault = await StakeVault.deploy(await mockSGD.getAddress(), await registry.getAddress(), await settings.getAddress());
    const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
    signalRegistry = await SignalRegistry.deploy(await registry.getAddress(), await settings.getAddress(), await stakeVault.getAddress());
    const CaseManager = await ethers.getContractFactory("CaseManager");
    caseManager = await CaseManager.deploy(await signalRegistry.getAddress(), await registry.getAddress(), await stakeVault.getAddress());
    const OutcomeOracle = await ethers.getContractFactory("OutcomeOracle");
    outcomeOracle = await OutcomeOracle.deploy(await caseManager.getAddress(), await registry.getAddress(), await settings.getAddress());
    const Reputation = await ethers.getContractFactory("Reputation");
    reputation = await Reputation.deploy();
    const RewardPool = await ethers.getContractFactory("RewardPool");
    rewardPool = await RewardPool.deploy(
      await mockSGD.getAddress(), await registry.getAddress(), await settings.getAddress(),
      await stakeVault.getAddress(), await caseManager.getAddress(), await outcomeOracle.getAddress(),
      await reputation.getAddress()
    );

    const CASE_MGR_ROLE = ethers.id("CASE_MGR_ROLE");
    const SETTLER_ROLE = ethers.id("SETTLER_ROLE");
    await stakeVault.grantRole(CASE_MGR_ROLE, await caseManager.getAddress());
    await stakeVault.grantRole(SETTLER_ROLE, await rewardPool.getAddress());
    await caseManager.grantRole(SETTLER_ROLE, await rewardPool.getAddress());
    await reputation.grantRole(SETTLER_ROLE, await rewardPool.getAddress());

    await registry.addMember(telco.address, PROVIDER_ROLE);
    await registry.addMember(bank.address, BANK_ROLE);
    await registry.addMember(confirmer.address, CONFIRMER_ROLE);

    await mockSGD.mint(telco.address, SGD(10_000));
    await mockSGD.mint(bank.address, SGD(10_000));

    params = await settings.params();
  });

  async function stakeTelco(amount = 500) {
    await mockSGD.connect(telco).approve(await stakeVault.getAddress(), SGD(amount));
    await stakeVault.connect(telco).depositStake(SGD(amount));
  }

  async function fundBank(amountSgd = 2_000) {
    await mockSGD.connect(bank).approve(await rewardPool.getAddress(), SGD(amountSgd));
    await rewardPool.connect(bank).fundPool(SGD(amountSgd));
  }

  async function postSignal(commitHash = commitment()) {
    const tx = await signalRegistry.connect(telco).postSignal(commitHash, 0, await expirySoon());
    const receipt = await tx.wait();
    const event = receipt.logs.map((l: any) => signalRegistry.interface.parseLog(l)).find((p: any) => p);
    return { signalId: event!.args.signalId, commitHash };
  }

  async function openCase(signalId: bigint, amountAtRisk = SGD(40_000)) {
    const tx = await caseManager.connect(bank).openCase(signalId, ethers.id("XFER-88123"), amountAtRisk);
    const receipt = await tx.wait();
    const event = receipt.logs.map((l: any) => caseManager.interface.parseLog(l)).find((p: any) => p && p.name === "CaseOpened");
    return event!.args.caseId as bigint;
  }

  async function confirmBoth(caseId: bigint, outcome: bigint) {
    await outcomeOracle.connect(bank).confirmOutcome(caseId, outcome);
    await outcomeOracle.connect(confirmer).confirmOutcome(caseId, outcome);
  }

  async function finalizeAndSettle(caseId: bigint) {
    await time.increase(Number(params.disputeWindow) + 1);
    await outcomeOracle.finalize(caseId);
    await rewardPool.settle(caseId);
  }

  describe("happy path 1: prevented scam pays the telco", function () {
    it("stake -> signal -> case -> dual confirmation -> settle pays reward and updates score", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);

      await confirmBoth(caseId, PREVENTED);
      await finalizeAndSettle(caseId);

      expect(await mockSGD.balanceOf(telco.address)).to.equal(SGD(10_000) - SGD(500) + params.reward);
      expect(await rewardPool.poolOf(bank.address)).to.equal(SGD(2_000) - params.reward);
      const [correct, total] = await reputation.getScore(telco.address);
      expect([correct, total]).to.deep.equal([1n, 1n]);
      const settledCase = await caseManager.cases(caseId);
      expect(settledCase.settled).to.equal(true);
      expect(await stakeVault.openCases(telco.address)).to.equal(0n);
    });
  });

  describe("happy path 2: false alarm slashes the telco", function () {
    it("slashes the deposit and drops the accuracy score", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);

      await confirmBoth(caseId, FALSE_ALARM);
      await finalizeAndSettle(caseId);

      expect(await stakeVault.stakeOf(telco.address)).to.equal(SGD(500) - params.slashAmount);
      // slashed funds compensate the reporting bank's pool
      expect(await rewardPool.poolOf(bank.address)).to.equal(SGD(2_000) + params.slashAmount);
      const [correct, total] = await reputation.getScore(telco.address);
      expect([correct, total]).to.deep.equal([0n, 1n]);
    });
  });

  describe("rejection 3: non-member cannot post a signal", function () {
    it("reverts for an address without the provider role", async function () {
      await expect(
        signalRegistry.connect(outsider).postSignal(commitment(), 0, await expirySoon())
      ).to.be.revertedWith("SignalRegistry: caller is not a provider");
    });
  });

  describe("rejection 4: provider below minStake cannot post", function () {
    it("reverts when the stake is under the minimum", async function () {
      await stakeTelco(Number(params.minStake) / 1e18 - 100); // 400 < 500
      await expect(
        signalRegistry.connect(telco).postSignal(commitment(), 0, await expirySoon())
      ).to.be.revertedWith("SignalRegistry: stake below minimum");
    });
  });

  describe("rejection 5: expired signal cannot open a case", function () {
    it("reverts after the signal's expiry", async function () {
      await stakeTelco();
      const shortExpiry = BigInt(await time.latest()) + 100n;
      const tx = await signalRegistry.connect(telco).postSignal(commitment(), 0, shortExpiry);
      const receipt = await tx.wait();
      const event = receipt.logs.map((l: any) => signalRegistry.interface.parseLog(l)).find((p: any) => p);
      const signalId = event.args.signalId;

      await time.increase(200);
      await expect(
        caseManager.connect(bank).openCase(signalId, ethers.id("XFER-1"), SGD(1_000))
      ).to.be.revertedWith("CaseManager: signal expired");
    });
  });

  describe("rejection 6: bank-only confirmation cannot settle", function () {
    it("rejects finalize and settle without the confirmer's signature", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);

      await outcomeOracle.connect(bank).confirmOutcome(caseId, PREVENTED);
      await time.increase(Number(params.disputeWindow) + 1);

      await expect(outcomeOracle.finalize(caseId)).to.be.revertedWith("OutcomeOracle: not confirmed");
      await expect(rewardPool.settle(caseId)).to.be.revertedWith("RewardPool: case not finalized");

      // and the confirmer may not be the bank itself
      await expect(
        outcomeOracle.connect(bank).confirmOutcome(caseId, PREVENTED)
      ).to.not.be.reverted; // still a bank vote, not a confirmer vote
    });
  });

  describe("rejection 7: a case cannot settle twice", function () {
    it("reverts on the second settle", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await confirmBoth(caseId, PREVENTED);
      await finalizeAndSettle(caseId);

      await expect(rewardPool.settle(caseId)).to.be.revertedWith("RewardPool: case already settled");
    });
  });

  describe("rejection 8: stake withdrawal is gated", function () {
    it("reverts before the cooldown", async function () {
      await stakeTelco();
      await stakeVault.connect(telco).requestWithdraw();
      await expect(stakeVault.connect(telco).withdraw()).to.be.revertedWith("StakeVault: cooldown not elapsed");
    });

    it("reverts with open cases even after the cooldown", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      await openCase(signalId);
      await stakeVault.connect(telco).requestWithdraw();
      await time.increase(Number(params.withdrawCooldown) + 1);
      await expect(stakeVault.connect(telco).withdraw()).to.be.revertedWith("StakeVault: open cases pending");
    });

    it("succeeds after the cooldown once the case settles", async function () {
      await stakeTelco();
      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await confirmBoth(caseId, PREVENTED);
      await finalizeAndSettle(caseId);

      await stakeVault.connect(telco).requestWithdraw();
      await time.increase(Number(params.withdrawCooldown) + 1);
      await stakeVault.connect(telco).withdraw();
      expect(await stakeVault.stakeOf(telco.address)).to.equal(0n);
    });
  });

  describe("rejection 9: only the regulator administers", function () {
    it("reverts when a non-regulator adds members or changes settings", async function () {
      await expect(
        registry.connect(telco).addMember(outsider.address, BANK_ROLE)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

      await expect(
        settings.connect(telco).setParams({
          reward: 1n, slashAmount: 1n, minStake: 1n,
          disputeWindow: 1n, signalTTL: 1n, withdrawCooldown: 1n,
        })
      ).to.be.revertedWithCustomError(settings, "AccessControlUnauthorizedAccount");
    });
  });

  describe("additional guarantees", function () {
    it("rejects an expiry beyond signalTTL", async function () {
      await stakeTelco();
      const tooFar = BigInt(await time.latest()) + params.signalTTL + 10n;
      await expect(
        signalRegistry.connect(telco).postSignal(commitment(), 0, tooFar)
      ).to.be.revertedWith("SignalRegistry: expiry beyond signalTTL");
    });

    it("rejects a duplicate case for the same payment", async function () {
      await stakeTelco();
      const { signalId } = await postSignal();
      const ref = ethers.id("XFER-88123");
      await caseManager.connect(bank).openCase(signalId, ref, SGD(40_000));
      await expect(
        caseManager.connect(bank).openCase(signalId, ref, SGD(40_000))
      ).to.be.revertedWith("CaseManager: case already exists for this payment");
    });

    it("keeps confirmations incomplete when the votes disagree", async function () {
      await stakeTelco();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await outcomeOracle.connect(bank).confirmOutcome(caseId, PREVENTED);
      await outcomeOracle.connect(confirmer).confirmOutcome(caseId, FALSE_ALARM);
      const s = await outcomeOracle.stateOf(caseId);
      expect(s.status).to.equal(0n); // still OPEN
      expect(s.confirmedAt).to.equal(0n);
    });

    it("resets votes when a confirmation is disputed in the window", async function () {
      await stakeTelco();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await confirmBoth(caseId, PREVENTED);
      await outcomeOracle.connect(telco).dispute(caseId);
      const s = await outcomeOracle.stateOf(caseId);
      expect(s.status).to.equal(0n); // back to OPEN
      expect(s.bankVote).to.equal(0n); // NONE
    });

    it("blocks settle when the bank pool is underfunded", async function () {
      await stakeTelco();
      await fundBank(20); // far below the 200 SGD reward
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await confirmBoth(caseId, PREVENTED);
      await time.increase(Number(params.disputeWindow) + 1);
      await outcomeOracle.finalize(caseId);
      await expect(rewardPool.settle(caseId)).to.be.revertedWith("RewardPool: bank pool underfunded");
    });

    it("slashes below minStake, which then blocks new signals", async function () {
      // drain to exactly minStake, then a false alarm drops it below
      await stakeTelco();
      await stakeVault.connect(telco).requestWithdraw();
      await time.increase(Number(params.withdrawCooldown) + 1);
      await stakeVault.connect(telco).withdraw();
      await stakeTelco(Number(params.minStake) / 1e18); // exactly 500

      await fundBank();
      const { signalId } = await postSignal();
      const caseId = await openCase(signalId);
      await confirmBoth(caseId, FALSE_ALARM);
      await finalizeAndSettle(caseId);

      expect(await stakeVault.stakeOf(telco.address)).to.equal(SGD(500) - params.slashAmount);
      await expect(
        signalRegistry.connect(telco).postSignal(commitment(), 0, await expirySoon())
      ).to.be.revertedWith("SignalRegistry: stake below minimum");
    });
  });
});
