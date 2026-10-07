import { useEffect, useState } from "react";
import { Btn, Chip, KV, Panel } from "./ui";
import { ledgerEvents } from "../lib/abi";
import { roleBytes, type RoleName } from "../lib/abi";
import { sgd, shortAddr, type Clients, type Params, type PersonaId, type Send } from "../lib/chain";
import { StakePanel } from "./OffchainLane";

const fmtDur = (s: bigint) => (s >= 86400n ? `${Number(s) / 86400}d` : s >= 3600n ? `${Number(s) / 3600}h` : `${Number(s) / 60}min`);

export function Rail({
  clients, persona, send, params, perPersona, blockNumber, tick,
}: {
  clients: Clients; persona: PersonaId; send: Send; params: Params;
  perPersona: Record<string, { stake: bigint; openCases: bigint; pool: bigint; sgd: bigint; score: { correct: bigint; total: bigint }; withdrawRequestAt: bigint }>;
  blockNumber: bigint; tick: number;
}) {
  const telco = clients.deployment.personas.telco;
  const bank = clients.deployment.personas.bank;
  const me = persona;

  return (
    <div>
      <ParamsPanel clients={clients} persona={persona} send={send} params={params} />
      <MembersPanel clients={clients} persona={persona} send={send} tick={tick} />
      {telco && perPersona["telco"] && (
        <StakePanel clients={clients} persona={me} send={send} stake={perPersona["telco"].stake} openCases={perPersona["telco"].openCases}
          withdrawRequestAt={perPersona["telco"].withdrawRequestAt} minStake={params.minStake}
          cooldown={params.withdrawCooldown} sgdBalance={perPersona["telco"].sgd} />
      )}
      {telco && perPersona["telco"] && (
        <Panel title="Provider accuracy" hint="Public score, updated only by settlement.">
          <KV k="Correct" v={perPersona["telco"].score.correct.toString()} />
          <KV k="Total" v={perPersona["telco"].score.total.toString()} />
          <KV k="Accuracy" v={perPersona["telco"].score.total > 0n
            ? `${Math.round(Number(perPersona["telco"].score.correct * 100n / perPersona["telco"].score.total))}%`
            : "—"} />
        </Panel>
      )}
      {bank && perPersona["bank"] && (
        <PoolPanel clients={clients} persona={me} send={send} pool={perPersona["bank"].pool} reward={params.reward} sgdBalance={perPersona["bank"].sgd} />
      )}
      <LedgerPanel clients={clients} blockNumber={blockNumber} />
    </div>
  );
}

function ParamsPanel({ clients, persona, send, params }: { clients: Clients; persona: PersonaId; send: Send; params: Params }) {
  const isRegulator = persona === "regulator";
  const [reward, setReward] = useState(params.reward);
  const [slash, setSlash] = useState(params.slashAmount);
  const [minStake, setMinStake] = useState(params.minStake);
  useEffect(() => {
    setReward(params.reward); setSlash(params.slashAmount); setMinStake(params.minStake);
  }, [params]);
  const toSgd = (v: string) => BigInt(v || "0") * 10n ** 18n;

  return (
    <Panel title="Network parameters" hint={isRegulator ? "You hold the regulator key. Parameters change only through you." : "Set by the regulator (a multisig in production)."}>
      <KV k="Reward (PREVENTED)" v={`S$ ${sgd(params.reward)}`} />
      <KV k="Slash (FALSE_ALARM)" v={`S$ ${sgd(params.slashAmount)}`} />
      <KV k="Minimum stake" v={`S$ ${sgd(params.minStake)}`} />
      <KV k="Dispute window" v={fmtDur(params.disputeWindow)} />
      <KV k="Signal TTL" v={fmtDur(params.signalTTL)} />
      <KV k="Withdraw cooldown" v={fmtDur(params.withdrawCooldown)} />
      {isRegulator && (
        <div className="row" style={{ marginTop: 10 }}>
          <input className="w-s" type="number" value={Number(reward) / 1e18 || ""} onChange={(e) => setReward(toSgd(e.target.value))} aria-label="Reward SGD" />
          <input className="w-s" type="number" value={Number(slash) / 1e18 || ""} onChange={(e) => setSlash(toSgd(e.target.value))} aria-label="Slash SGD" />
          <input className="w-s" type="number" value={Number(minStake) / 1e18 || ""} onChange={(e) => setMinStake(toSgd(e.target.value))} aria-label="Min stake SGD" />
          <Btn variant="ghost" small disabled={reward === params.reward && slash === params.slashAmount && minStake === params.minStake}
            onClick={() => send("regulator", "Settings", "setParams",
              [{ reward, slashAmount: slash, minStake, disputeWindow: params.disputeWindow, signalTTL: params.signalTTL, withdrawCooldown: params.withdrawCooldown }],
              "Update parameters")}>
            Set
          </Btn>
        </div>
      )}
    </Panel>
  );
}

function MembersPanel({ clients, persona, send, tick }: { clients: Clients; persona: PersonaId; send: Send; tick: number }) {
  const isRegulator = persona === "regulator";
  const [addr, setAddr] = useState("");
  const [role, setRole] = useState<RoleName>("PROVIDER_ROLE");
  const [members, setMembers] = useState<{ addr: string; role: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: { addr: string; role: string }[] = [];
      for (const [name, a] of Object.entries(clients.deployment.personas)) {
        if (name === "regulator") { out.push({ addr: a, role: "REGULATOR" }); continue; }
        try {
          const r = await clients.publicClient.readContract({
            address: clients.deployment.contracts.ParticipantRegistry,
            // minimal inline ABI; avoids importing the full registry ABI here
            abi: [{ name: "roleOf", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bytes32" }] }] as const,
            functionName: "roleOf", args: [a],
          }) as `0x${string}`;
          const known: Record<string, string> = {
            [roleBytes("PROVIDER_ROLE")]: "PROVIDER",
            [roleBytes("BANK_ROLE")]: "BANK",
            [roleBytes("CONFIRMER_ROLE")]: "CONFIRMER",
            [roleBytes("REGULATOR_ROLE")]: "REGULATOR",
          };
          out.push({ addr: a, role: known[r.toLowerCase()] ?? "MEMBER" });
        } catch { out.push({ addr: a, role: "?" }); }
      }
      if (alive) setMembers(out);
    })();
    return () => { alive = false; };
  }, [clients, tick]);

  return (
    <Panel title="Members" hint="A permissioned network: only the regulator approves participants.">
      {members.map((m) => (
        <div className="row" key={m.addr}>
          <Chip kind={m.role === "REGULATOR" ? "chain" : undefined}>{m.role}</Chip>
          <span className="mono muted">{shortAddr(m.addr as `0x${string}`)}</span>
          {isRegulator && m.role !== "REGULATOR" && (
            <Btn variant="ghost" small style={{ marginLeft: "auto" }}
              onClick={() => send("regulator", "ParticipantRegistry", "removeMember", [m.addr], `Remove ${m.role}`)}>
              remove
            </Btn>
          )}
        </div>
      ))}
      {isRegulator && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="w-m" type="text" placeholder="0x… address" value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="Member address" />
          <select value={role} onChange={(e) => setRole(e.target.value as RoleName)} aria-label="Role">
            <option value="PROVIDER_ROLE">Provider</option>
            <option value="BANK_ROLE">Bank</option>
            <option value="CONFIRMER_ROLE">Confirmer</option>
          </select>
          <Btn variant="ghost" small disabled={!addr.startsWith("0x") || addr.length !== 42}
            onClick={async () => {
              await send("regulator", "ParticipantRegistry", "addMember", [addr, roleBytes(role)], `Add ${role.replace("_ROLE", "")}`);
              setAddr("");
            }}>add</Btn>
        </div>
      )}
    </Panel>
  );
}

function PoolPanel({ clients, persona, send, pool, reward, sgdBalance }: {
  clients: Clients; persona: PersonaId; send: Send; pool: bigint; reward: bigint; sgdBalance: bigint;
}) {
  const isBank = persona === "bank";
  const [amount, setAmount] = useState("1000");
  return (
    <Panel title="Reward pool" extra={<span>bank</span>} hint="Rewards are paid from the bank's own funded pool.">
      <KV k="Pool balance" v={`S$ ${sgd(pool)}`} vClass={pool >= reward ? "" : "alert"} />
      <KV k="Reward per case" v={`S$ ${sgd(reward)}`} />
      <KV k="Bank wallet" v={`S$ ${sgd(sgdBalance)}`} />
      {isBank && (
        <div className="row" style={{ marginTop: 10 }}>
          <input className="w-s" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Fund amount SGD" />
          <Btn small variant="chain" onClick={async () => {
            const amt = BigInt(amount) * 10n ** 18n;
            await send("bank", "MockSGD", "approve", [clients.deployment.contracts.RewardPool, amt], "Approve SGD");
            await send("bank", "RewardPool", "fundPool", [amt], `Fund pool S$${amount}`);
          }}>Fund pool</Btn>
        </div>
      )}
    </Panel>
  );
}

function LedgerPanel({ clients, blockNumber }: { clients: Clients; blockNumber: bigint }) {
  const [rows, setRows] = useState<{ key: string; text: string; block: bigint }[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const from = clients.net === "sepolia" && blockNumber > 20000n ? blockNumber - 20000n : 0n;
      const out: { key: string; text: string; block: bigint }[] = [];
      for (const le of ledgerEvents) {
        const address = clients.deployment.contracts[le.contract];
        if (!address) continue;
        try {
          const logs = await clients.publicClient.getLogs({ address, event: le.event, fromBlock: from });
          for (const log of logs) {
            const a = log.args as Record<string, unknown>;
            let text = `${le.event.name.replace(/^(SignalPosted|CaseOpened|OutcomeConfirmed|CaseFinalized|CaseSettledPrevented|CaseSettledFalseAlarm|Staked|Slashed|PoolFunded|MemberAdded|ParamsSet)$/, (m) => m)}`;
            const n = (v: unknown) => (typeof v === "bigint" ? v.toString() : "");
            switch (le.event.name) {
              case "SignalPosted": text = `signal #${n(a.signalId)} committed by ${shortAddr(a.provider as `0x${string}`)}`; break;
              case "CaseOpened": text = `case #${n(a.caseId)} opened on signal #${n(a.signalId)} — S$ ${sgd(a.amountAtRisk as bigint)} at risk`; break;
              case "OutcomeConfirmed": text = `case #${n(a.caseId)} confirmed ${Number(a.outcome) === 1 ? "PREVENTED" : "FALSE ALARM"}`; break;
              case "CaseFinalized": text = `case #${n(a.caseId)} finalized after dispute window`; break;
              case "CaseSettledPrevented": text = `case #${n(a.caseId)} settled — reward S$ ${sgd(a.reward as bigint)} paid`; break;
              case "CaseSettledFalseAlarm": text = `case #${n(a.caseId)} settled — S$ ${sgd(a.slashed as bigint)} slashed`; break;
              case "Staked": text = `provider staked S$ ${sgd(a.amount as bigint)}`; break;
              case "Slashed": text = `S$ ${sgd(a.amount as bigint)} slashed from ${shortAddr(a.provider as `0x${string}`)}`; break;
              case "PoolFunded": text = `bank funded pool with S$ ${sgd(a.amount as bigint)}`; break;
              case "MemberAdded": text = `member added ${shortAddr(a.member as `0x${string}`)}`; break;
              case "ParamsSet": text = `network parameters updated`; break;
            }
            out.push({ key: `${log.transactionHash}-${log.logIndex}`, text, block: log.blockNumber ?? 0n });
          }
        } catch { /* provider may cap range; skip */ }
      }
      out.sort((x, y) => Number(y.block - x.block));
      if (alive) setRows(out.slice(0, 30));
    })();
    return () => { alive = false; };
  }, [clients, blockNumber]);

  return (
    <Panel title="Ledger" hint="Every state change on the shared ledger, newest first.">
      {rows.length === 0 && <div className="empty">No events yet.</div>}
      {rows.map((r) => (
        <div className="ledger-row" key={r.key}>
          <span className="t">#{r.block.toString()}</span>
          <span>{r.text}</span>
        </div>
      ))}
    </Panel>
  );
}
