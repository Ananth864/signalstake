import { useState } from "react";
import { Btn, Chip, KV, Panel } from "./ui";
import { chainNow, commitmentOf, parseSgd, randomNonce, sgd, shortHash, type Clients, type PersonaId, type Params, type Send, type SignalRec } from "../lib/chain";
import { channelAdd, channelList, type ChannelEntry } from "../lib/offchain";

/**
 * The OFF-CHAIN lane: the simulated private telco->bank channel and, for the
 * telco persona, the composer that seals warning details into a commitment.
 */
export function OffchainLane({
  clients, persona, send, params, blockTimestamp, signals,
}: {
  clients: Clients; persona: PersonaId; send: Send; params: Params;
  blockTimestamp: bigint; signals: SignalRec[];
}) {
  const isTelco = persona === "telco";
  return (
    <section className="lane lane-offchain">
      <div className="lane-head">
        off-chain · private
        <span className="lane-note">the telco→bank channel (simulated) — details never touch the chain</span>
      </div>
      <div style={{ padding: 14 }}>
        {isTelco && <Composer clients={clients} send={send} params={params} blockTimestamp={blockTimestamp} />}
        <ChannelPanel signals={signals} />
      </div>
    </section>
  );
}

function Composer({
  send, params, blockTimestamp,
}: { clients: Clients; send: Send; params: Params; blockTimestamp: bigint }) {
  const [risk, setRisk] = useState("Customer on a 20-minute call with a number linked to a fake government official scam");
  const [typeIdx, setTypeIdx] = useState(0);
  const [paymentRef, setPaymentRef] = useState("XFER-88123");
  const [amount, setAmount] = useState("40000");
  const [nonce] = useState(randomNonce());
  const [crossing, setCrossing] = useState(false);

  const details = JSON.stringify({ scenario: "live", risk, transferAmount: `S$${Number(amount).toLocaleString("en-SG")}`, paymentRef });
  const commit = commitmentOf(nonce, details);
  const expiry = chainNow(blockTimestamp) + params.signalTTL;

  const post = async () => {
    setCrossing(true);
    const ok = await send("telco", "SignalRegistry", "postSignal", [commit, typeIdx, expiry], "Post signal");
    if (!ok) { setCrossing(false); return; }
    channelAdd({ commitHash: commit, nonce, details, postedAt: Date.now() });
    setTimeout(() => setCrossing(false), 1300);
  };

  return (
    <Panel title="Compose a scam warning" tut="composer" hint="You are the telco. The details stay in the private channel; only the commitment below goes on-chain.">
      <div className="row"><label>Type</label>
        <select value={typeIdx} onChange={(e) => setTypeIdx(Number(e.target.value))}>
          <option value={0}>Scam call</option><option value={1}>Scam SMS</option><option value={2}>Scam site</option>
        </select>
      </div>
      <div className="row">
        <input className="w-m" type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} aria-label="Payment reference" />
        <input className="w-s" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount at risk (SGD)" />
        <span className="muted">SGD at risk</span>
      </div>
      <textarea rows={2} value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Warning details" />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="muted mono">nonce {shortHash(nonce)}</span>
        <span className={`commit-chip${crossing ? " crossing" : ""}`}>C = {shortHash(commit)}</span>
        <span style={{ marginLeft: "auto" }}>
          <Btn variant="chain" onClick={post}>Seal &amp; post commitment</Btn>
        </span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Expiry will be set to {params.signalTTL >= 3600n ? `${Number(params.signalTTL) / 3600}h` : `${Number(params.signalTTL) / 60}min`} from now (signalTTL).
      </p>
    </Panel>
  );
}

function ChannelPanel({ signals }: { signals: SignalRec[] }) {
  const entries = channelList();
  const onChain = new Set(signals.map((s) => s.commitHash.toLowerCase()));
  return (
    <Panel title="Private channel" tut="channel" hint="Warning details shared telco→bank. The bank sees these; the ledger never does.">
      {entries.length === 0 && <div className="empty">No warnings shared yet. <b>The telco posts one to start the flow.</b></div>}
      {entries.map((e: ChannelEntry) => {
        let parsed: Record<string, string> = {};
        try { parsed = JSON.parse(e.details); } catch { /* keep raw */ }
        const committed = onChain.has(e.commitHash.toLowerCase());
        return (
          <div className="rec" key={e.commitHash}>
            <div className="rec-top">
              {committed ? <Chip kind="chain">committed on-chain</Chip> : <Chip kind="amber">not yet posted</Chip>}
              <span className="mono muted">C = {shortHash(e.commitHash)}</span>
              <span className="mono muted" style={{ marginLeft: "auto" }}>nonce {shortHash(e.nonce)}</span>
            </div>
            <div className="rec-main">{parsed.risk ?? e.details}</div>
            {parsed.transferAmount && (
              <div className="sig-grid mono" style={{ fontSize: 12 }}>
                <span className="muted">at risk</span><span>{parsed.transferAmount}</span>
                <span className="muted">ref</span><span>{parsed.paymentRef}</span>
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

export function StakePanel({
  clients, persona, send, stake, openCases, withdrawRequestAt, minStake, cooldown, sgdBalance,
}: {
  clients: Clients; persona: PersonaId; send: Send; stake: bigint; openCases: bigint; withdrawRequestAt: bigint;
  minStake: bigint; cooldown: bigint; sgdBalance: bigint;
}) {
  const [amount, setAmount] = useState("500");
  const isTelco = persona === "telco";
  const now = BigInt(Math.floor(Date.now() / 1000));
  const cooldownLeft = withdrawRequestAt > 0n ? Number(withdrawRequestAt + cooldown - now) : 0;
  const amountWei = parseSgd(amount);
  return (
    <Panel title="Stake vault" tut="stake-vault" extra={<span>telco</span>}
      hint={isTelco ? "Your deposit backs every signal. Below min stake you cannot post." : "The telco's deposit. Below min stake it cannot post."}>
      <KV k="Staked" v={`S$ ${sgd(stake)}`} vClass={stake >= minStake ? "" : "alert"} />
      <KV k="Minimum" v={`S$ ${sgd(minStake)}`} />
      <KV k="Open cases" v={openCases.toString()} />
      <KV k="Wallet" v={`S$ ${sgd(sgdBalance)}`} />
      {isTelco && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="w-s" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Stake amount (SGD)" />
            <Btn variant="chain" small disabled={amountWei === 0n} onClick={async () => {
              await send("telco", "MockSGD", "approve", [clients.deployment.contracts.StakeVault, amountWei], "Approve SGD");
              await send("telco", "StakeVault", "depositStake", [amountWei], `Stake S$${amount}`);
            }}>
              Deposit stake
            </Btn>
          </div>
          <div className="row">
            <Btn variant="ghost" small disabled={stake === 0n || withdrawRequestAt > 0n}
              onClick={() => send("telco", "StakeVault", "requestWithdraw", [], "Request withdrawal")}>
              Request withdrawal
            </Btn>
            <Btn variant="ghost" small
              disabled={withdrawRequestAt === 0n || cooldownLeft > 0 || openCases > 0n}
              onClick={() => send("telco", "StakeVault", "withdraw", [], "Withdraw stake")}>
              Withdraw
            </Btn>
            {withdrawRequestAt > 0n && cooldownLeft > 0 && <Chip kind="amber">cooldown {cooldownLeft}s</Chip>}
            {withdrawRequestAt > 0n && cooldownLeft <= 0 && openCases > 0n && <Chip kind="alert">blocked: {openCases.toString()} open case(s)</Chip>}
          </div>
        </>
      )}
    </Panel>
  );
}
