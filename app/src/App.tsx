import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PERSONAS, fetchDeployments, makeClients, makeSend, readAll,
  type Clients, type Deployment, type PersonaId,
} from "./lib/chain";
import { channelInit } from "./lib/offchain";
import { OffchainLane } from "./components/OffchainLane";
import { OnchainLane } from "./components/OnchainLane";
import { Rail } from "./components/Rail";

type Net = "localhost" | "sepolia";

export default function App() {
  const [deployments, setDeployments] = useState<{ localhost?: Deployment; sepolia?: Deployment }>({});
  const [net, setNet] = useState<Net>("localhost");
  const [persona, setPersona] = useState<PersonaId>("regulator");
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState("starting…");
  const [data, setData] = useState<Awaited<ReturnType<typeof readAll>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { channelInit(); fetchDeployments().then(setDeployments); }, []);

  const clients: Clients | null = useMemo(
    () => (deployments[net] ? makeClients(deployments[net], net) : null),
    [deployments, net]
  );

  const bump = useCallback(() => setTick((t) => t + 1), []);
  const send = useMemo(
    () => (clients ? makeSend(clients, setStatus, bump) : null),
    [clients, bump]
  );

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

  if (!deployments.localhost && !deployments.sepolia) {
    return <Shell status="no deployment found"><EmptyDeployment /></Shell>;
  }
  if (!clients || !data || !send) {
    return <Shell status={status}>{error ? <div className="empty">Cannot reach {net}: <span className="mono">{error}</span></div> : <div className="empty">connecting to {net}…</div>}</Shell>;
  }

  return (
    <Shell
      status={status}
      net={net}
      netOptions={{ localhost: !!deployments.localhost, sepolia: !!deployments.sepolia }}
      onNet={setNet}
      persona={persona}
      onPersona={setPersona}
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
    </Shell>
  );
}

function Shell({
  children, status, net, netOptions, onNet, persona, onPersona,
}: {
  children: React.ReactNode; status: string;
  net?: Net; netOptions?: { localhost: boolean; sepolia: boolean }; onNet?: (n: Net) => void;
  persona?: PersonaId; onPersona?: (p: PersonaId) => void;
}) {
  return (
    <>
      <div className="topbars">
        <header className="masthead">
          <span className="wordmark">Signal<span className="stake">Stake</span></span>
          <span className="tagline">a staked scam-warning exchange</span>
          <span className="spacer" />
          {net && <span className="netchip"><span className="dot">●</span> {net}</span>}
          <span className="netchip">{status}</span>
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
            {netOptions?.sepolia && netOptions?.localhost && onNet && net && (
              <span style={{ marginLeft: 24 }} className="seg">
                <button aria-pressed={net === "localhost"} onClick={() => onNet("localhost")}>local node</button>
                <button aria-pressed={net === "sepolia"} onClick={() => onNet("sepolia")}>Sepolia (read-only)</button>
              </span>
            )}
          </nav>
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
    </div>
  );
}
