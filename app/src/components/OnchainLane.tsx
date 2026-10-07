import { useState } from "react";
import { keccak256, toBytes } from "viem";
import { Btn, Chip, KV, Panel } from "./ui";
import { OUTCOME_LABEL, SIGNAL_TYPES, chainNow, parseSgd, sgd, shortAddr, shortHash,
  type CaseRec, type Clients, type OracleState, type Params, type PersonaId, type Send, type SignalRec,
} from "../lib/chain";
import { channelByCommit } from "../lib/offchain";

/**
 * The ON-CHAIN lane: the shared ledger of signals and cases, with the
 * four-stage flow visible per case: signal → case → dual confirmation → settlement.
 */
export function OnchainLane({
  clients, persona, send, params, blockTimestamp, signals, cases, oracleStates,
}: {
  clients: Clients; persona: PersonaId; send: Send; params: Params; blockTimestamp: bigint;
  signals: SignalRec[]; cases: CaseRec[]; oracleStates: OracleState[];
}) {
  const personaAddr = clients.accountFor(persona);
  return (
    <section className="lane lane-onchain">
      <div className="lane-head">
        on-chain · shared ledger
        <span className="lane-note">commitments, cases, outcomes and settlement — the record nobody controls</span>
      </div>
      <div style={{ padding: 14 }}>
        <SignalsPanel persona={persona} personaAddr={personaAddr} send={send} signals={signals} blockTimestamp={blockTimestamp} />
        <CasesPanel persona={persona} personaAddr={personaAddr} send={send} params={params}
          cases={cases} oracleStates={oracleStates} blockTimestamp={blockTimestamp} />
      </div>
    </section>
  );
}

function SignalsPanel({
  persona, personaAddr, send, signals, blockTimestamp,
}: {
  persona: PersonaId; personaAddr: `0x${string}` | null; send: Send;
  signals: SignalRec[]; blockTimestamp: bigint;
}) {
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [ref, setRef] = useState("XFER-88123");
  const [amount, setAmount] = useState("40000");
  const isBank = persona === "bank";
  const amountWei = parseSgd(amount);

  return (
    <Panel title="Signals" tut="signals" hint="Commitments posted by providers. No personal data — just fingerprints.">
      {signals.length === 0 && <div className="empty">No signals yet. <b>The telco seals a warning to begin.</b></div>}
      {signals.map((s) => {
        const left = Number(s.expiry - chainNow(blockTimestamp));
        const expired = left <= 0;
        const channelEntry = channelByCommit(s.commitHash);
        const seedRef = (): string => {
          if (!channelEntry) return ref;
          try { return JSON.parse(channelEntry.details).paymentRef ?? ref; } catch { return ref; }
        };
        return (
          <div className="rec" key={s.id}>
            <div className="rec-top">
              <Chip kind="chain">#{s.id.toString()}</Chip>
              <span className="commit-chip">C = {shortHash(s.commitHash)}</span>
              <Chip>{SIGNAL_TYPES[s.signalType] ?? `type ${s.signalType}`}</Chip>
              {expired
                ? <Chip kind="alert">expired</Chip>
                : <Chip kind={left < 300 ? "amber" : undefined}>live {left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : `${Math.floor(left / 60)}m ${left % 60}s`}</Chip>}
              <span className="mono muted" style={{ marginLeft: "auto" }}>{shortAddr(s.provider)}</span>
            </div>
            {isBank && (
              openFor === Number(s.id) ? (
                <div className="row">
                  <input className="w-m" type="text" value={ref}
                    onChange={(e) => setRef(e.target.value)} aria-label="Payment reference" />
                  <input className="w-s" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount at risk" />
                  <Btn variant="chain" small disabled={amountWei === 0n}
                    onClick={async () => {
                      const ok = await send("bank", "CaseManager", "openCase", [s.id, keccak256(toBytes(ref)), amountWei], `Open case on signal #${s.id}`);
                      if (ok) setOpenFor(null);
                    }}>
                    Open case
                  </Btn>
                  <Btn variant="ghost" small onClick={() => setOpenFor(null)}>Cancel</Btn>
                </div>
              ) : (
                <div className="row">
                  {!expired && (
                    <Btn variant="ghost" small onClick={() => { setRef(seedRef()); setOpenFor(Number(s.id)); }}>Use this signal (hold payment, open case)</Btn>
                  )}
                  {expired && (
                    <>
                      <Btn variant="alert" small
                        onClick={() => send("bank", "CaseManager", "openCase", [s.id, keccak256(toBytes(ref)), BigInt(amount) * 10n ** 18n], `Open case on expired signal #${s.id}`)}>
                        Try case on expired signal
                      </Btn>
                      <span className="hint" style={{ alignSelf: "center" }}>the chain must refuse — that refusal is the demo</span>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function CasesPanel({
  persona, personaAddr, send, params, cases, oracleStates, blockTimestamp,
}: {
  persona: PersonaId; personaAddr: `0x${string}` | null; send: Send; params: Params;
  cases: CaseRec[]; oracleStates: OracleState[]; blockTimestamp: bigint;
}) {
  const isBank = persona === "bank";
  const isConfirmer = persona === "confirmer";
  const isTelco = persona === "telco";

  return (
    <Panel title="Cases" tut="cases" hint="A case records that a bank used a signal on a held payment. Bank + confirmer both sign the outcome; the contract settles.">
      {cases.length === 0 && <div className="empty">No cases yet. <b>The bank opens one from a live signal.</b></div>}
      {cases.map((c, i) => {
        const st = oracleStates[i];
        const stage = c.settled ? 4 : st.status === 2 ? 3 : st.status === 1 ? 3 : 2;
        const finalizeIn = st.status === 1 ? Number(st.confirmedAt + params.disputeWindow - chainNow(blockTimestamp)) : 0;
        const canFinalize = st.status === 1 && finalizeIn <= 0;
        const myCase = personaAddr && c.bank.toLowerCase() === personaAddr.toLowerCase();
        const myProvider = personaAddr && c.provider.toLowerCase() === personaAddr.toLowerCase();
        const bankVoted = st.bankVote !== 0;
        const confirmerVoted = st.confirmerVote !== 0;

        return (
          <div className="rec" key={c.caseId}>
            <div className="rec-top">
              <Chip kind="chain">case #{c.caseId.toString()}</Chip>
              <span className="mono muted">signal #{c.signalId.toString()}</span>
              <span className="mono muted">ref {shortHash(c.paymentRef)}</span>
              <span className="mono" style={{ marginLeft: "auto" }}>S$ {sgd(c.amountAtRisk)} at risk</span>
            </div>
            <Stepper stage={stage} settled={c.settled} outcome={st.outcome} />
            <div className="row">
              {st.status === 0 && !c.settled && (
                <>
                  <Chip kind={bankVoted ? "settle" : undefined}>bank {bankVoted ? `voted ${OUTCOME_LABEL[st.bankVote]}` : "silent"}</Chip>
                  <Chip kind={confirmerVoted ? "settle" : undefined}>confirmer {confirmerVoted ? `voted ${OUTCOME_LABEL[st.confirmerVote]}` : "silent"}</Chip>
                </>
              )}
              {st.status === 1 && !c.settled && (
                <Chip kind="amber">confirmed {OUTCOME_LABEL[st.outcome]} · dispute window {finalizeIn > 0 ? `${finalizeIn}s` : "closed"}</Chip>
              )}
              {st.status === 2 && !c.settled && <Chip kind="chain">finalized: {OUTCOME_LABEL[st.outcome]}</Chip>}
              {c.settled && st.outcome === 1 && <Chip kind="settle">settled PREVENTED — reward paid</Chip>}
              {c.settled && st.outcome === 2 && <Chip kind="alert">settled FALSE ALARM — stake slashed</Chip>}
            </div>
            {!c.settled && (
              <div className="row">
                {isBank && myCase && st.status === 0 && (
                  <>
                    <Btn small variant="settle" onClick={() => send("bank", "OutcomeOracle", "confirmOutcome", [c.caseId, 1], "Bank votes PREVENTED")}>Vote prevented</Btn>
                    <Btn small variant="alert" onClick={() => send("bank", "OutcomeOracle", "confirmOutcome", [c.caseId, 2], "Bank votes FALSE ALARM")}>Vote false alarm</Btn>
                  </>
                )}
                {isConfirmer && st.status === 0 && (
                  <>
                    <Btn small variant="settle" onClick={() => send("confirmer", "OutcomeOracle", "confirmOutcome", [c.caseId, 1], "Confirmer votes PREVENTED")}>Second: prevented</Btn>
                    <Btn small variant="alert" onClick={() => send("confirmer", "OutcomeOracle", "confirmOutcome", [c.caseId, 2], "Confirmer votes FALSE ALARM")}>Second: false alarm</Btn>
                  </>
                )}
                {((isBank && myCase) || isTelco) && st.status === 1 && finalizeIn > 0 && (
                  <Btn variant="ghost" small onClick={() => send(persona, "OutcomeOracle", "dispute", [c.caseId], "Dispute outcome")}>Dispute</Btn>
                )}
                {canFinalize && (
                  <Btn small variant="chain" onClick={() => send(persona, "OutcomeOracle", "finalize", [c.caseId], "Finalize case")}>Finalize</Btn>
                )}
                {st.status === 2 && (
                  <Btn small variant="settle" onClick={() => send(persona, "RewardPool", "settle", [c.caseId], "Settle case")}>Settle — pay / slash</Btn>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function Stepper({ stage, settled, outcome }: { stage: number; settled: boolean; outcome: number }) {
  const steps = ["signal used", "case open", "confirmed ×2", settled ? (outcome === 1 ? "reward paid" : "stake slashed") : "settle"];
  return (
    <div className="stepper">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < stage || (settled && n === 4);
        const current = n === stage && !settled;
        return (
          <span key={label} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <span className="step-line" />}
            <span className={`step${done ? " done" : ""}${current ? " current" : ""}`}>
              <span className="n">{done ? "✓" : n}</span>{label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
