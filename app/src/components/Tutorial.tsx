import { useEffect, useRef, type ReactNode } from "react";
import { Btn } from "./ui";
import type { PersonaId } from "../lib/chain";

/**
 * The interactive tutorial: a non-modal walkthrough. Each step may switch the
 * persona and spotlights one panel via its data-tut anchor; the viewer can
 * still click the real UI while the card explains it.
 */
const STEPS: { title: string; body: ReactNode; persona?: PersonaId; selector?: string }[] = [
  {
    title: "Welcome to the exchange",
    body: <>SignalStake settles scam warnings with money on the line: telcos stake, banks hold payments, two independent signatures decide, the contract pays or slashes. This tour walks the real UI, and you can click along. Make sure <b>local node</b> is selected up top.</>,
  },
  {
    title: "You are four people",
    selector: ".persona-bar",
    body: <>Everything changes with the <b>acting as</b> switch: regulator, telco, bank, confirmer. Each persona holds its own key; the panels and buttons on screen are exactly what that key may do.</>,
  },
  {
    title: "Off-chain: the private channel",
    selector: ".lane-offchain",
    body: <>Above the boundary is the private telco→bank channel. The warning details, the caller story, amounts and payment ref, live here. In this demo they are stored in your browser only.</>,
  },
  {
    title: "The boundary",
    selector: ".boundary",
    body: <>The dashed line is the privacy story. <b>Commitments cross, details never do.</b> What lands on-chain is a hash of the exact words, enough to hold the telco to them, useless to a scammer.</>,
  },
  {
    title: "On-chain: the shared ledger",
    selector: ".lane-onchain",
    body: <>Below the line, the record nobody controls: signals (commitments), cases, the two votes, and settlement. Every panel here reads straight from the contracts.</>,
  },
  {
    title: "As the telco: compose a warning",
    persona: "telco", selector: '[data-tut="composer"]',
    body: <>Type the warning — the default is the “Mdm Tan” scenario. Watch the live chip: every keystroke changes C, because C is the hash of these exact details. Nothing has been posted yet.</>,
  },
  {
    title: "As the telco: back it with stake",
    selector: '[data-tut="stake-vault"]',
    body: <>The telco’s S$ 500 deposit is what makes the warning credible. Post with <code>Seal &amp; post commitment</code> — only then does C appear in Signals. Below the minimum stake, the chain refuses.</>,
  },
  {
    title: "As the bank: fund the pool",
    persona: "bank", selector: '[data-tut="pool"]',
    body: <>Rewards come from the bank’s own pool, not from thin air. Fund it with the approve → fund pair; the reward per case (S$ 200) is a regulator parameter.</>,
  },
  {
    title: "As the bank: use a signal",
    selector: '[data-tut="signals"]',
    body: <>The bank holds Mdm Tan’s payment and opens a case against the signal — one case per signal, bank and payment ref. From here the case’s four-stage stepper tracks it to settlement.</>,
  },
  {
    title: "Two signatures settle it",
    selector: '[data-tut="cases"]',
    body: <>Bank votes, then the confirmer co-signs. As the confirmer persona, press <code>Second: prevented</code>. Votes must match; a dispute resets them. After the 5-minute dispute window, <code>Finalize</code> then <code>Settle — pay / slash</code> close the case forever.</>,
  },
  {
    title: "The rail: score and receipts",
    selector: '[data-tut="rail"]',
    body: <>The right rail is the public memory: parameters, members, the telco’s accuracy (updated only by settlement), the pool, and the ledger feed of every event.</>,
  },
  {
    title: "Your turn",
    body: <>Run the happy path: telco stakes and posts → bank funds and opens → both vote PREVENTED → wait out the window (or time-travel — see the Guide) → finalize and settle. Then try the false alarm and watch the slash. The <b>Guide</b> page has every step written down.</>,
  },
];

export function Tutorial({
  step, onStep, persona, onPersona,
}: {
  step: number; onStep: (s: number | null) => void;
  persona: PersonaId; onPersona: (p: PersonaId) => void;
}) {
  const spotted = useRef<HTMLElement | null>(null);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // A step may ask for a persona switch before its target exists.
  useEffect(() => {
    if (s?.persona && s.persona !== persona) onPersona(s.persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Spotlight the target once the (possibly re-rendered) DOM settles.
  useEffect(() => {
    const wait = s?.persona && s.persona !== persona ? 420 : 80;
    const t = setTimeout(() => {
      spotted.current?.classList.remove("tutorial-spot");
      spotted.current = null;
      if (s?.selector) {
        const el = document.querySelector(s.selector) as HTMLElement | null;
        if (el) {
          el.classList.add("tutorial-spot");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          spotted.current = el;
        }
      } else {
        // Steps without a target (welcome, closing) start from the top.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, persona]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStep(null);
      else if (e.key === "ArrowRight" && step < STEPS.length - 1) onStep(step + 1);
      else if (e.key === "ArrowLeft" && step > 0) onStep(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Clear the spotlight when the tutorial unmounts.
  useEffect(() => () => { spotted.current?.classList.remove("tutorial-spot"); }, []);

  if (!s) return null;
  return (
    <aside className="tutorial-card" role="dialog" aria-label={`Tutorial step ${step + 1} of ${STEPS.length}: ${s.title}`}>
      <div className="tut-top">
        <span className="tut-count">{step + 1} / {STEPS.length}</span>
        {s.persona && <span className="tut-persona">acting as {s.persona}</span>}
        <button className="tut-close" aria-label="Close tutorial" onClick={() => onStep(null)}>×</button>
      </div>
      <h4>{s.title}</h4>
      <div className="tut-body">{s.body}</div>
      <div className="tut-actions">
        <Btn variant="ghost" small disabled={step === 0} onClick={() => onStep(step - 1)}>Back</Btn>
        <span className="tut-keys">esc to exit · ←/→ to move</span>
        {last
          ? <Btn variant="settle" small onClick={() => onStep(null)}>Done</Btn>
          : <Btn small onClick={() => onStep(step + 1)}>Next</Btn>}
      </div>
    </aside>
  );
}
