import { type ReactNode } from "react";
import { Btn, Chip } from "./ui";

/**
 * The Guide: how to run SignalStake. Static content; no chain needed.
 * Button references are live: clicking one jumps to the dashboard, switches
 * persona if needed, and glows the actual control until the next action.
 */
export function GuidePage({ onRunTutorial, onGotoRef }: { onRunTutorial: () => void; onGotoRef: (label: string) => void }) {
  return (
    <div className="guide">
      <header className="guide-hero">
        <p className="guide-eyebrow">field guide</p>
        <h1>How to use SignalStake</h1>
        <p className="guide-lede">
          A telco stakes money before it can warn a bank about a scam. The bank holds the payment and opens a case.
          The bank and an independent confirmer both sign the outcome. The contract then pays the telco a reward,
          or takes part of its stake. Warning details never go on-chain, only their hash.
        </p>
        <p className="guide-note">Every <Ref label="Deposit stake" onGo={onGotoRef} />-style name below is live: click it and the dashboard opens with that control glowing.</p>
        <div className="guide-cta">
          <Btn variant="chain" onClick={onRunTutorial}>Run the interactive tutorial</Btn>
          <span className="hint">12 short steps, right on the live dashboard.</span>
        </div>
        <div className="mini-lanes" aria-hidden="true">
          <div className="mini-off">off-chain · private<span>warning details: caller, amount, payment ref</span></div>
          <div className="mini-boundary">the boundary — commitments cross, details never do</div>
          <div className="mini-on">on-chain · shared ledger<span>C = keccak256(nonce ‖ details) · cases · outcomes · payments</span></div>
        </div>
      </header>

      <section className="guide-section">
        <h2>Who does what</h2>
        <p className="guide-note">Switch roles with the <b>acting as</b> buttons under the header. What you can do depends on the role.</p>
        <div className="cast-grid">
          {CAST.map((c) => (
            <div className="cast-card" key={c.label}>
              <h3>{c.label}</h3>
              <p className="cast-blurb">{c.blurb}</p>
              <p className="cast-does">{c.does}</p>
              {c.clicks.length > 0 && <p className="cast-clicks">clicks: {c.clicks.map((b) => <Ref key={b} label={b} onGo={onGotoRef} />)}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <h2>Walkthrough: stop a scam</h2>
        <p className="guide-note">
          Defaults on the local node: reward S$ 200, slash S$ 60, minimum stake S$ 500, dispute window 5 min,
          signal TTL 2h. The regulator can change all of these in <b>Network parameters</b>.
        </p>
        <ol className="guide-steps">
          {HAPPY_PATH.map((s, i) => (
            <li key={i}>
              <span className="step-no" aria-hidden="true">{i + 1}</span>
              <div className="step-body">
                <p className="step-who"><span className="who-tag">{s.who}</span>{s.where && <span className="where"> · {s.where}</span>}</p>
                <p>{s.what}</p>
                {s.click && <p className="step-click">click <Ref label={s.click} onGo={onGotoRef} />{s.clickThen && <> then <Ref label={s.clickThen} onGo={onGotoRef} /></>}</p>}
                {s.see && <p className="step-see"><Chip kind="settle">then</Chip>{s.see}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section">
        <h2>Walkthrough: a false alarm</h2>
        <p className="guide-note">Same steps, opposite votes.</p>
        <ol className="guide-steps">
          <li><span className="step-no alt" aria-hidden="true">1</span>
            <div className="step-body">
              <p className="step-who"><span className="who-tag">telco</span></p>
              <p>Post a spammy warning, for example: "customer on a normal call with their accountant".</p>
            </div>
          </li>
          <li><span className="step-no alt" aria-hidden="true">2</span>
            <div className="step-body">
              <p className="step-who"><span className="who-tag">bank</span> <span className="who-tag">confirmer</span></p>
              <p>Open the case. Both vote false alarm.</p>
              <p className="step-click">click <Ref label="Vote false alarm" onGo={onGotoRef} /> and <Ref label="Second: false alarm" onGo={onGotoRef} /></p>
            </div>
          </li>
          <li><span className="step-no alt" aria-hidden="true">3</span>
            <div className="step-body">
              <p className="step-who"><span className="who-tag">anyone</span> · after the dispute window</p>
              <p>Finalize, then settle. The contract takes S$ 60 from the telco's deposit and credits the reporting bank's pool. The public accuracy drops, for example to 1 of 2.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="guide-section">
        <h2>Rules the contract enforces</h2>
        <p className="guide-note">Every rule below is a <code>require</code> in Solidity. Where you can see it in the dashboard, the last column says so.</p>
        <div className="guard-table" role="table" aria-label="Guardrail rules">
          <div className="guard-head" role="row">
            <span role="columnheader">rule</span>
            <span role="columnheader">enforced by</span>
            <span role="columnheader">where you see it</span>
          </div>
          {GUARDRAILS(onGotoRef).map((g, i) => (
            <div className="guard-row" role="row" key={i}>
              <span role="cell">{g.rule}</span>
              <span role="cell" className="mono">{g.by}</span>
              <span role="cell">{g.ui}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section">
        <h2>Run it yourself</h2>
        <pre className="guide-pre">{`# terminal 1 — local chain
npm run node

# terminal 2 — deploy contracts + register the demo members
npm run deploy:local

# seed the scene: telco stakes S$500, bank funds the pool, "Mdm Tan" signal posted
npm run seed:local

# terminal 3 — the dashboard
cd app && npm install && npm run dev   # http://localhost:5173`}</pre>
        <p className="guide-note">
          <b>Sepolia (read-only):</b> the same nine contracts run there. Flip the toggle in the header to browse them.
          Writes need a wallet, so demos run on the local node.
        </p>
        <aside className="demo-tip">
          <b>Skip the 5-minute wait.</b> Two ways. As the regulator, set <b>Dispute window</b> to 1 minute and press
          <Ref label="Set" onGo={onGotoRef} />. The contract reads the window at finalize time, so
          <Ref label="Finalize" onGo={onGotoRef} /> appears in 60 seconds. Or move chain time from a Hardhat console
          attached to the node:
          <pre className="guide-pre tight">{`await network.provider.send("evm_increaseTime", [301]);
await network.provider.send("evm_mine");`}</pre>
          <span>This jumps the chain 302 seconds ahead, and <Ref label="Finalize" onGo={onGotoRef} /> lights up.</span>
        </aside>
      </section>
    </div>
  );
}

function Ref({ label, onGo }: { label: string; onGo: (label: string) => void }) {
  return (
    <button type="button" className="ref-code" title={`Show ${label} in the dashboard`} onClick={() => onGo(label)}>
      {label}
    </button>
  );
}

const CAST = [
  {
    label: "Regulator",
    blurb: "governs members and parameters",
    does: "Adds providers, banks and confirmers to the network. Sets the reward, slash, minimum stake and time windows.",
    clicks: ["Set", "add", "remove"],
  },
  {
    label: "Telco",
    blurb: "provider — stakes and posts signals",
    does: "Puts up a S$ 500 deposit, writes the warning in the private channel, and posts its hash.",
    clicks: ["Deposit stake", "Seal & post commitment"],
  },
  {
    label: "Bank",
    blurb: "holds payments, opens cases",
    does: "Funds the reward pool, holds the payment, opens the case, votes, finalizes and settles.",
    clicks: ["Fund pool", "Use this signal", "Vote prevented", "Finalize", "Settle"],
  },
  {
    label: "Confirmer",
    blurb: "independent second signature",
    does: "Checks the outcome and signs second. No case settles without a matching vote.",
    clicks: ["Second: prevented", "Second: false alarm", "Dispute"],
  },
];

const HAPPY_PATH: { who: string; where?: string; what: string; click?: string; clickThen?: string; see?: string }[] = [
  {
    who: "telco", where: "Stake vault",
    what: "Stake S$ 500. Below the minimum, the contract rejects new warnings.",
    click: "Deposit stake",
    see: "Staked S$ 500 shows in the vault panel.",
  },
  {
    who: "telco", where: "Compose a scam warning",
    what: "Write the warning about Mdm Tan's call. Press the button and watch the commitment chip cross the boundary.",
    click: "Seal & post commitment",
    see: "The details stay in the private channel. The chain stores only C = 0xc435….",
  },
  {
    who: "bank", where: "Reward pool",
    what: "Top up the pool that pays rewards. Each prevented case pays S$ 200 out of it.",
    click: "Fund pool",
    see: "Pool balance shows the new total.",
  },
  {
    who: "bank", where: "Signals",
    what: "Hold Mdm Tan's payment: open a case on the signal.",
    click: "Use this signal (hold payment, open case)",
    see: "A case appears with four stages: signal used, case open, confirmed ×2, settle.",
  },
  {
    who: "bank", where: "Cases",
    what: "The bank signs the outcome first.",
    click: "Vote prevented",
    see: "Chip: bank voted PREVENTED, confirmer silent.",
  },
  {
    who: "confirmer", where: "Cases",
    what: "The confirmer checks and signs second. The vote must match the bank's.",
    click: "Second: prevented",
    see: "Chip: confirmed PREVENTED, dispute window counting down.",
  },
  {
    who: "anyone", where: "Cases",
    what: "Wait for the window, then close the case. Settlement happens once and pays automatically.",
    click: "Finalize",
    clickThen: "Settle — pay / slash",
    see: "Ledger: settled, reward S$ 200 paid. Telco accuracy 1 of 1, 100%.",
  },
];

const GUARDRAILS = (go: (label: string) => void): { rule: string; by: string; ui: ReactNode }[] => [
  { rule: "Non-members cannot post signals", by: "ParticipantRegistry", ui: "only registered wallets hold provider keys" },
  { rule: "A stake below S$ 500 blocks posting", by: "StakeVault", ui: "the Staked value turns red" },
  { rule: "Expired signals cannot back a case", by: "SignalRegistry, CaseManager", ui: <>the chip flips to expired; the red <Ref label="Try case on expired signal" onGo={go} /> button shows the refusal</> },
  { rule: "One vote is never enough", by: "OutcomeOracle", ui: "settle needs two matching votes; a dispute resets them" },
  { rule: "A case settles once", by: "RewardPool", ui: "the settle button disappears after settlement" },
  { rule: "No early exit from the vault", by: "StakeVault", ui: "withdraw waits out the cooldown and needs zero open cases" },
  { rule: "Only the regulator governs", by: "AccessControl", ui: "Set, add and remove render for the regulator only" },
];
