import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatUnits,
  keccak256,
  toBytes,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mockSgdAbi, registryAbi, settingsAbi, stakeVaultAbi, signalRegistryAbi,
  caseManagerAbi, outcomeOracleAbi, rewardPoolAbi, reputationAbi,
} from "./abi";

export type Deployment = {
  network: string;
  chainId: number;
  deployedAt: string;
  contracts: Record<string, Address>;
  personas: Record<string, Address>;
  rpcUrl?: string;
};

export type PersonaId = "regulator" | "telco" | "bank" | "confirmer";

export const PERSONAS: { id: PersonaId; label: string; blurb: string }[] = [
  { id: "regulator", label: "Regulator", blurb: "governs members and parameters" },
  { id: "telco", label: "Telco", blurb: "provider — stakes and posts signals" },
  { id: "bank", label: "Bank", blurb: "holds payments, opens cases" },
  { id: "confirmer", label: "Confirmer", blurb: "independent second signature" },
];

// Well-known Hardhat dev keys — public, local-network only.
const DEV_KEYS: Record<string, `0x${string}`> = {
  regulator: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0
  telco: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",     // #1
  bank: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",      // #2
  confirmer: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3
};

export const localhostChain = defineChain({
  id: 31337,
  name: "Localhost 31337",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export type Clients = {
  deployment: Deployment;
  net: "localhost" | "sepolia";
  readOnly: boolean;
  publicClient: PublicClient;
  walletFor: (p: PersonaId) => WalletClient | null;
  accountFor: (p: PersonaId) => Address | null;
};

export function makeClients(deployment: Deployment, net: "localhost" | "sepolia"): Clients {
  const rpcUrl = net === "localhost" ? "http://127.0.0.1:8545" : deployment.rpcUrl || "https://ethereum-sepolia-rpc.publicnode.com";
  const chain = net === "localhost"
    ? localhostChain
    : defineChain({ id: 11155111, name: "Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const readOnly = net !== "localhost";
  const accounts: Partial<Record<PersonaId, Address>> = {};
  for (const p of Object.keys(DEV_KEYS) as PersonaId[]) {
    accounts[p] = deployment.personas[p];
  }
  return {
    deployment,
    net,
    readOnly,
    publicClient,
    accountFor: (p) => accounts[p] ?? null,
    walletFor: (p) => {
      if (readOnly || !DEV_KEYS[p]) return null;
      return createWalletClient({ account: privateKeyToAccount(DEV_KEYS[p]), chain, transport: http(rpcUrl) });
    },
  };
}

export async function fetchDeployments(): Promise<{ localhost?: Deployment; sepolia?: Deployment }> {
  const out: { localhost?: Deployment; sepolia?: Deployment } = {};
  for (const net of ["localhost", "sepolia"] as const) {
    try {
      const res = await fetch(`./${net}.json`);
      if (res.ok) out[net] = await res.json();
    } catch { /* not deployed */ }
  }
  return out;
}

// ---------- reading ----------

export type Params = { reward: bigint; slashAmount: bigint; minStake: bigint; disputeWindow: bigint; signalTTL: bigint; withdrawCooldown: bigint };
export type SignalRec = { id: bigint; provider: Address; commitHash: `0x${string}`; signalType: number; postedAt: bigint; expiry: bigint };
export type CaseRec = { caseId: bigint; signalId: bigint; bank: Address; provider: Address; paymentRef: `0x${string}`; amountAtRisk: bigint; openedAt: bigint; settled: boolean };
export type OracleState = { bankVote: number; confirmerVote: number; confirmedAt: bigint; outcome: number; status: number };

// viem may decode structs as positional arrays or objects depending on ABI
// shape; normalise to keyed objects either way.
function asObj(v: unknown, keys: string[]): Record<string, unknown> {
  if (Array.isArray(v)) {
    const o: Record<string, unknown> = {};
    keys.forEach((k, i) => (o[k] = v[i]));
    return o;
  }
  return v as Record<string, unknown>;
}

export async function readAll(c: Clients) {
  const d = c.deployment;
  const pc = c.publicClient;
  const rawParams = (await pc.readContract({ address: d.contracts.Settings, abi: settingsAbi, functionName: "params" })) as readonly bigint[];
  const params: Params = {
    reward: rawParams[0], slashAmount: rawParams[1], minStake: rawParams[2],
    disputeWindow: rawParams[3], signalTTL: rawParams[4], withdrawCooldown: rawParams[5],
  };
  const [block, nextSignal, nextCase] = await Promise.all([
    pc.getBlock({ blockTag: "latest" }),
    pc.readContract({ address: d.contracts.SignalRegistry, abi: signalRegistryAbi, functionName: "nextSignalId" }) as Promise<bigint>,
    pc.readContract({ address: d.contracts.CaseManager, abi: caseManagerAbi, functionName: "nextCaseId" }) as Promise<bigint>,
  ]);

  const maxRows = 30n;
  const signalIds: bigint[] = [];
  for (let i = nextSignal - 1n; i >= 1n && i > nextSignal - 1n - maxRows; i--) signalIds.push(i);
  const caseIds: bigint[] = [];
  for (let i = nextCase - 1n; i >= 1n && i > nextCase - 1n - maxRows; i--) caseIds.push(i);

  const [signalRaws, caseRaws, oracleRaws] = await Promise.all([
    Promise.all(signalIds.map((id) =>
      pc.readContract({ address: d.contracts.SignalRegistry, abi: signalRegistryAbi, functionName: "signals", args: [id] }))),
    Promise.all(caseIds.map((id) =>
      pc.readContract({ address: d.contracts.CaseManager, abi: caseManagerAbi, functionName: "cases", args: [id] }))),
    Promise.all(caseIds.map((id) =>
      pc.readContract({ address: d.contracts.OutcomeOracle, abi: outcomeOracleAbi, functionName: "stateOf", args: [id] }))),
  ]);

  const sigKeys = ["id", "provider", "commitHash", "signalType", "postedAt", "expiry"];
  const caseKeys = ["caseId", "signalId", "bank", "provider", "paymentRef", "amountAtRisk", "openedAt", "settled"];
  const oracleKeys = ["bankVote", "confirmerVote", "confirmedAt", "outcome", "status"];
  const signals = signalRaws.map((r) => {
    const o = asObj(r, sigKeys);
    return { id: o.id as bigint, provider: o.provider as Address, commitHash: o.commitHash as `0x${string}`, signalType: Number(o.signalType), postedAt: o.postedAt as bigint, expiry: o.expiry as bigint };
  });
  const cases = caseRaws.map((r) => {
    const o = asObj(r, caseKeys);
    return { caseId: o.caseId as bigint, signalId: o.signalId as bigint, bank: o.bank as Address, provider: o.provider as Address, paymentRef: o.paymentRef as `0x${string}`, amountAtRisk: o.amountAtRisk as bigint, openedAt: o.openedAt as bigint, settled: Boolean(o.settled) };
  });
  const oracleStates = oracleRaws.map((r) => {
    const o = asObj(r, oracleKeys);
    return { bankVote: Number(o.bankVote), confirmerVote: Number(o.confirmerVote), confirmedAt: o.confirmedAt as bigint, outcome: Number(o.outcome), status: Number(o.status) };
  });

  const personas = Object.entries(d.personas);
  const [stakeOf, openCasesOf, poolOf, balances, scores, withdrawAt] = await Promise.all([
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.StakeVault, abi: stakeVaultAbi, functionName: "stakeOf", args: [a] }) as Promise<bigint>)),
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.StakeVault, abi: stakeVaultAbi, functionName: "openCases", args: [a] }) as Promise<bigint>)),
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.RewardPool, abi: rewardPoolAbi, functionName: "poolOf", args: [a] }) as Promise<bigint>)),
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.MockSGD, abi: mockSgdAbi, functionName: "balanceOf", args: [a] }) as Promise<bigint>)),
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.Reputation, abi: reputationAbi, functionName: "getScore", args: [a] }) as Promise<readonly [bigint, bigint]>)),
    Promise.all(personas.map(([, a]) =>
      pc.readContract({ address: d.contracts.StakeVault, abi: stakeVaultAbi, functionName: "withdrawRequestAt", args: [a] }) as Promise<bigint>)),
  ]);

  const perPersona: Record<string, { stake: bigint; openCases: bigint; pool: bigint; sgd: bigint; score: { correct: bigint; total: bigint }; withdrawRequestAt: bigint }> = {};
  personas.forEach(([name, addr], i) => {
    perPersona[name] = { stake: stakeOf[i], openCases: openCasesOf[i], pool: poolOf[i], sgd: balances[i], score: { correct: scores[i][0], total: scores[i][1] }, withdrawRequestAt: withdrawAt[i] };
    perPersona[addr.toLowerCase()] = perPersona[name];
  });

  return {
    params, blockNumber: block.number, blockTimestamp: block.timestamp,
    signals: signals.reverse(), cases: cases.reverse(), oracleStates: oracleStates.reverse(),
    perPersona,
  };
}

// ---------- writing ----------

export type Send = (persona: PersonaId, contract: keyof Deployment["contracts"], fn: string, args: unknown[], label: string) => Promise<boolean>;

// viem wraps reverts in multi-line boilerplate; pull out the actual reason.
function revertReason(e: unknown): string {
  if (e instanceof Error) {
    const base = (e as { shortMessage?: string }).shortMessage ?? e.message;
    const m = base.match(/execution reverted:?\s*([^"]+)/);
    const text = m ? m[1] : base;
    return text.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown error";
  }
  return String(e).slice(0, 160);
}

export function makeSend(c: Clients, onNotice: (n: { kind: "busy" | "ok" | "err"; text: string }) => void, onDone: () => void): Send {
  return async (persona, contractKey, fn, args, label) => {
    const wallet = c.walletFor(persona);
    if (!wallet) { onNotice({ kind: "err", text: `${label}: read-only on this network` }); return false; }
    const abi = {
      MockSGD: mockSgdAbi, ParticipantRegistry: registryAbi, Settings: settingsAbi, StakeVault: stakeVaultAbi,
      SignalRegistry: signalRegistryAbi, CaseManager: caseManagerAbi, OutcomeOracle: outcomeOracleAbi,
      RewardPool: rewardPoolAbi, Reputation: reputationAbi,
    }[contractKey]!;
    onNotice({ kind: "busy", text: `${label} — signing…` });
    try {
      const hash = await wallet.writeContract({
        address: c.deployment.contracts[contractKey],
        abi,
        functionName: fn,
        args,
      } as never);
      onNotice({ kind: "busy", text: `${label} — mined ${hash.slice(0, 10)}…` });
      await c.publicClient.waitForTransactionReceipt({ hash });
      onNotice({ kind: "ok", text: `${label} — confirmed.` });
      onDone();
      return true;
    } catch (e: unknown) {
      onNotice({ kind: "err", text: `${label} — refused: ${revertReason(e)}` });
      return false;
    }
  };
}

// ---------- helpers ----------

export const sgd = (v: bigint) =>
  new Intl.NumberFormat("en-SG", { maximumFractionDigits: 2 }).format(Number(formatUnits(v, 18)));

export const shortHash = (h: `0x${string}`) => `${h.slice(0, 8)}…${h.slice(-6)}`;
export const shortAddr = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Hardhat only stamps a new block when one is mined, so after a long idle
// spell the latest block lags the wall clock by hours and expiries computed
// from it land in the past. Take the later of the two; a time-travelled
// chain (evm_increaseTime) keeps its larger, travelled timestamp.
export function chainNow(blockTs: bigint): bigint {
  const real = BigInt(Math.floor(Date.now() / 1000));
  return real > blockTs ? real : blockTs;
}

// Whole-SGD input → wei; 0n for anything empty, negative or not a whole number,
// so a mistyped field disables the button instead of throwing in the handler.
export function parseSgd(v: string): bigint {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 0n;
  return BigInt(n) * 10n ** 18n;
}

export function commitmentOf(nonce: `0x${string}`, details: string): `0x${string}` {
  return keccak256(toBytes(nonce + details));
}

export function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (`0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`);
}

export const SIGNAL_TYPES = ["Scam call", "Scam SMS", "Scam site"];
export const OUTCOME_LABEL = ["", "PREVENTED", "FALSE ALARM"];
