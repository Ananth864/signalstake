import { parseAbi, parseAbiItem, keccak256, toBytes } from "viem";

export const mockSgdAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);

export const registryAbi = parseAbi([
  "function addMember(address member, bytes32 role)",
  "function removeMember(address member)",
  "function roleOf(address) view returns (bytes32)",
  "event MemberAdded(address indexed member, bytes32 role)",
  "event MemberRemoved(address indexed member, bytes32 role)",
]);

export const settingsAbi = parseAbi([
  "function params() view returns (uint256 reward, uint256 slashAmount, uint256 minStake, uint256 disputeWindow, uint256 signalTTL, uint256 withdrawCooldown)",
  "function setParams((uint256 reward, uint256 slashAmount, uint256 minStake, uint256 disputeWindow, uint256 signalTTL, uint256 withdrawCooldown) newParams)",
  "event ParamsSet((uint256 reward, uint256 slashAmount, uint256 minStake, uint256 disputeWindow, uint256 signalTTL, uint256 withdrawCooldown) params)",
]);

export const stakeVaultAbi = parseAbi([
  "function depositStake(uint256 amount)",
  "function requestWithdraw()",
  "function withdraw()",
  "function stakeOf(address) view returns (uint256)",
  "function openCases(address) view returns (uint256)",
  "function withdrawRequestAt(address) view returns (uint256)",
  "event Staked(address indexed provider, uint256 amount)",
  "event Slashed(address indexed provider, uint256 amount, address indexed creditedTo)",
]);

export const signalRegistryAbi = parseAbi([
  "function postSignal(bytes32 commitHash, uint8 signalType, uint64 expiry) returns (uint256)",
  "function nextSignalId() view returns (uint256)",
  "function signals(uint256 id) view returns (uint256 id, address provider, bytes32 commitHash, uint8 signalType, uint64 postedAt, uint64 expiry)",
  "event SignalPosted(uint256 indexed signalId, address indexed provider, bytes32 commitHash, uint8 signalType, uint64 postedAt, uint64 expiry)",
]);

export const caseManagerAbi = parseAbi([
  "function openCase(uint256 signalId, bytes32 paymentRef, uint256 amountAtRisk) returns (uint256)",
  "function nextCaseId() view returns (uint256)",
  "function cases(uint256 id) view returns (uint256 caseId, uint256 signalId, address bank, address provider, bytes32 paymentRef, uint256 amountAtRisk, uint64 openedAt, bool settled)",
  "event CaseOpened(uint256 indexed caseId, uint256 indexed signalId, address indexed bank, address provider, bytes32 paymentRef, uint256 amountAtRisk, uint64 openedAt)",
]);

export const outcomeOracleAbi = parseAbi([
  "function confirmOutcome(uint256 caseId, uint8 outcome)",
  "function dispute(uint256 caseId)",
  "function finalize(uint256 caseId)",
  "function stateOf(uint256 caseId) view returns (uint8 bankVote, uint8 confirmerVote, uint64 confirmedAt, uint8 outcome, uint8 status)",
  "event OutcomeConfirmed(uint256 indexed caseId, uint8 outcome, uint64 confirmedAt)",
  "event CaseFinalized(uint256 indexed caseId, uint8 outcome)",
]);

export const rewardPoolAbi = parseAbi([
  "function fundPool(uint256 amount)",
  "function settle(uint256 caseId)",
  "function poolOf(address) view returns (uint256)",
  "event PoolFunded(address indexed bank, uint256 amount)",
  "event CaseSettledPrevented(uint256 indexed caseId, address indexed provider, address indexed bank, uint256 reward)",
  "event CaseSettledFalseAlarm(uint256 indexed caseId, address indexed provider, address indexed bank, uint256 slashed)",
]);

export const reputationAbi = parseAbi([
  "function getScore(address provider) view returns (uint64 correct, uint64 total)",
]);

// The ledger event catalogue: where to listen, how to decode, how to describe.
export const ledgerEvents = [
  { contract: "SignalRegistry", event: parseAbiItem("event SignalPosted(uint256 indexed signalId, address indexed provider, bytes32 commitHash, uint8 signalType, uint64 postedAt, uint64 expiry)") },
  { contract: "CaseManager", event: parseAbiItem("event CaseOpened(uint256 indexed caseId, uint256 indexed signalId, address indexed bank, address provider, bytes32 paymentRef, uint256 amountAtRisk, uint64 openedAt)") },
  { contract: "OutcomeOracle", event: parseAbiItem("event OutcomeConfirmed(uint256 indexed caseId, uint8 outcome, uint64 confirmedAt)") },
  { contract: "OutcomeOracle", event: parseAbiItem("event CaseFinalized(uint256 indexed caseId, uint8 outcome)") },
  { contract: "RewardPool", event: parseAbiItem("event CaseSettledPrevented(uint256 indexed caseId, address indexed provider, address indexed bank, uint256 reward)") },
  { contract: "RewardPool", event: parseAbiItem("event CaseSettledFalseAlarm(uint256 indexed caseId, address indexed provider, address indexed bank, uint256 slashed)") },
  { contract: "StakeVault", event: parseAbiItem("event Staked(address indexed provider, uint256 amount)") },
  { contract: "StakeVault", event: parseAbiItem("event Slashed(address indexed provider, uint256 amount, address indexed creditedTo)") },
  { contract: "RewardPool", event: parseAbiItem("event PoolFunded(address indexed bank, uint256 amount)") },
  { contract: "ParticipantRegistry", event: parseAbiItem("event MemberAdded(address indexed member, bytes32 role)") },
  { contract: "Settings", event: parseAbiItem("event ParamsSet((uint256 reward, uint256 slashAmount, uint256 minStake, uint256 disputeWindow, uint256 signalTTL, uint256 withdrawCooldown) params)") },
] as const;

export type RoleName = "REGULATOR_ROLE" | "PROVIDER_ROLE" | "BANK_ROLE" | "CONFIRMER_ROLE";

export function roleBytes(name: RoleName): `0x${string}` {
  return keccak256(toBytes(name));
}
