import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PERSONAS, fetchDeployments, makeClients, makeSend, readAll,
  type Clients, type Deployment, type PersonaId,
} from "./lib/chain";
import { channelInit } from "./lib/offchain";
import { clearGlow, glowRef, REF_TARGETS } from "./lib/refTargets";
import { OffchainLane } from "./components/OffchainLane";
import { OnchainLane } from "./components/OnchainLane";
import { Rail } from "./components/Rail";
import { GuidePage } from "./components/GuidePage";
import { Tutorial } from "./components/Tutorial";

type Net = "localhost" | "sepolia";
type View = "dashboard" | "guide";

export default function App() {
  const [deployments, setDeployments] = useState<{ localhost?: Deployment; sepolia?: Deployment }>({});
  const [net, setNet] = useState<Net>("localhost");
  const [view, setView] = useState<View>("dashboard");
  const [tutStep, setTutStep] = useState<number | null>(null);
  // The tutorial button glows until pressed once; the dismissal sticks per browser.
  const [tutLaunched, setTutLaunched] = useState(
    () => localStorage.getItem("signalstake-tutorial-launched") === "1"
  );
  const [persona, setPersona] = useState<PersonaId>("regulator");
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState("starting…");
  const [notice, setNotice] = useState<{ kind: "busy" | "ok" | "err"; text: string } | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof readAll>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { channelInit(); fetchDeployments().then(setDeployments); }, []);

  // A hosted build ships only sepolia.json; never sit on a dead network.
  useEffect(() => {
    setNet((n) => (deployments[n] ? n : deployments.sepolia ? "sepolia" : deployments.localhost ? "localhost" : n));
  }, [deployments]);

  const clients: Clients | null = useMemo(
    () => (deployments[net] ? makeClients(deployments[net], net) : null),
    [deployments, net]
  );

  const bump = useCallback(() => setTick((t) => t + 1), []);
  const send = useMemo(
    () => (clients ? makeSend(clients, setNotice, bump) : null),
    [clients, bump]
  );

  // Transaction outcomes stay on screen; only good news auto-clears.
  useEffect(() => {
    if (!notice || notice.kind === "err") return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // Poll chain state every 3 seconds.
  useEffect(() => {
    if (!clients) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const d = await readAll(clients);
        if (alive) { setData(d); setError(null); setStatus(`block ${d.blockNumber}`); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message.slice(0, 160) : String(e));
      } finally {
        if (alive) timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [clients, tick]);

  const startTutorial = useCallback(() => {
    clearGlow();
    if (!deployments.localhost) {
      // Hosted read-only site: the tutorial's panels and writes don't exist here.
      setNotice({
        kind: "err",
        text: "The tutorial runs on the local node, which this site doesn't have. Start one with: npm run node, then npm run deploy:local && npm run seed:local, and open http://localhost:5173. (Here you're browsing the read-only Sepolia deployment.)",
      });
      return;
    }
    localStorage.setItem("signalstake-tutorial-launched", "1");
    setTutLaunched(true);
    setNet("localhost");
    setView("dashboard");
    setTutStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [deployments.localhost]);
  const gotoView = useCallback((v: View) => {
    clearGlow();
    setView(v);
    if (v === "guide") setTutStep(null);
    window.scrollTo(0, 0);
  }, []);
  // A guide reference: jump to the dashboard, take the right persona, glow the control.
  const gotoRef = useCallback((label: string) => {
    const t = REF_TARGETS[label];
    if (!t) return;
    setTutStep(null);
    setView("dashboard");
    if (t.persona) setPersona(t.persona);
    window.setTimeout(() => glowRef(label), 450);
  }, []);
  const netOptions = { localhost: !!deployments.localhost, sepolia: !!deployments.sepolia };

  if (view === "guide") {
    return (
      <Shell status={status} net={net} netOptions={netOptions} onNet={setNet}
        view={view} onView={gotoView} onRunTutorial={startTutorial}
        notice={notice} onDismissNotice={() => setNotice(null)} tutGlow={!tutLaunched}>
        <GuidePage onRunTutorial={startTutorial} onGotoRef={gotoRef} />
      </Shell>
    );
  }

  if (!deployments.localhost && !deployments.sepolia) {
    return (
      <Shell status="no deployment found" net={net} view={view} onView={gotoView} onRunTutorial={startTutorial}
        notice={notice} onDismissNotice={() => setNotice(null)} tutGlow={!tutLaunched}>
        <EmptyDeployment />
      </Shell>
    );
  }
  if (!clients || !data || !send) {
    return (
      <Shell status={status} net={net} view={view} onView={gotoView} onRunTutorial={startTutorial}
        notice={notice} onDismissNotice={() => setNotice(null)} tutGlow={!tutLaunched}>
        {error ? <div className="empty">Cannot reach {net}: <span className="mono">{error}</span></div> : <div className="empty">connecting to {net}…</div>}
      </Shell>
    );
  }

  return (
    <Shell
      status={status}
      net={net}
      netOptions={netOptions}
      onNet={setNet}
      persona={persona}
      onPersona={setPersona}
      view={view}
      onView={gotoView}
      onRunTutorial={startTutorial}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      tutGlow={!tutLaunched}
    >
      <div className="board">
        <div>
          <OffchainLane clients={clients} persona={persona} send={send} params={data.params}
            blockTimestamp={data.blockTimestamp} signals={data.signals} />
          <div className="boundary" aria-hidden="true">
            <span className="boundary-label">the boundary — commitments cross, details never do</span>
          </div>
          <OnchainLane clients={clients} persona={persona} send={send} params={data.params}
            blockTimestamp={data.blockTimestamp} signals={data.signals} cases={data.cases}
            oracleStates={data.oracleStates} />
        </div>
        <Rail clients={clients} persona={persona} send={send} params={data.params}
          perPersona={data.perPersona} blockNumber={data.blockNumber} tick={tick} />
      </div>
      {tutStep !== null && (
        <Tutorial step={tutStep} onStep={setTutStep} persona={persona} onPersona={setPersona} />
      )}
    </Shell>
  );
}

function Shell({
  children, status, net, netOptions, onNet, persona, onPersona, view, onView, onRunTutorial, notice, onDismissNotice, tutGlow = true,
}: {
  children: React.ReactNode; status: string;
  net?: Net; netOptions?: { localhost: boolean; sepolia: boolean }; onNet?: (n: Net) => void;
  persona?: PersonaId; onPersona?: (p: PersonaId) => void;
  view: View; onView: (v: View) => void; onRunTutorial: () => void;
  notice?: { kind: "busy" | "ok" | "err"; text: string } | null; onDismissNotice?: () => void;
  tutGlow?: boolean;
}) {
  return (
    <>
      <div className="topbars">
        <header className="masthead">
          <span className="wordmark">Signal<span className="stake">Stake</span></span>
          <span className="tagline">a staked scam-warning exchange</span>
          <span className="spacer" />
          <nav className="view-nav" aria-label="View">
            <span className="seg">
              <button aria-pressed={view === "dashboard"} onClick={() => onView("dashboard")}>dashboard</button>
              <button aria-pressed={view === "guide"} onClick={() => onView("guide")}>guide</button>
            </span>
          </nav>
          <button className={"tut-launch" + (tutGlow ? " glow" : "")} onClick={onRunTutorial}>run tutorial</button>
          {netOptions?.sepolia && netOptions?.localhost && onNet && net && (
            <span className="seg net-seg" aria-label="Network">
              <button aria-pressed={net === "localhost"} onClick={() => onNet("localhost")}>local node</button>
              <button aria-pressed={net === "sepolia"} onClick={() => onNet("sepolia")}>Sepolia (read-only)</button>
            </span>
          )}
          {net && (
            <span className="netchip">
              <span className="dot">●</span> {net}
              <span className="netchip-sep" aria-hidden="true">·</span>
              {status}
            </span>
          )}
        </header>
        {persona && onPersona && (
          <nav className="persona-bar" aria-label="Acting as">
            <span className="who">acting as</span>
            <span className="seg">
              {PERSONAS.map((p) => (
                <button key={p.id} aria-pressed={persona === p.id} onClick={() => onPersona(p.id)}>
                  {p.label}
                </button>
              ))}
            </span>
            <span className="persona-note">{PERSONAS.find((p) => p.id === persona)?.blurb}</span>
          </nav>
        )}
        {notice && (
          <div className={`notice ${notice.kind}`} role="status">
            <span className="notice-text">{notice.text}</span>
            {onDismissNotice && (
              <button className="notice-close" aria-label="Dismiss message" onClick={onDismissNotice}>×</button>
            )}
          </div>
        )}
      </div>
      <main>{children}</main>
    </>
  );
}

function EmptyDeployment() {
  return (
    <div className="empty" style={{ maxWidth: 640, margin: "40px auto" }}>
      <b>No deployment found.</b><br />
      Start the local chain, deploy, and seed:
      <pre className="mono" style={{ background: "var(--panel)", border: "1px solid var(--rule)", borderRadius: 8, padding: 12, marginTop: 10 }}>
npm run node          # terminal 1 — local chain{"\n"}
npm run deploy:local  # terminal 2 — contracts + demo members{"\n"}
npm run seed:local    # stake, fund pool, post the Mdm Tan signal
      </pre>
      New here? Open the <b>guide</b> in the masthead — or press <b>run tutorial</b> once the dashboard is up.
    </div>
  );
}
