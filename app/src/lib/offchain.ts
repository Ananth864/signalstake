// The simulated off-chain channel: where warning details live so they never
// touch the chain. Backed by localStorage, preloaded from /offchain-seed.json.

export type ChannelEntry = {
  commitHash: `0x${string}`;
  nonce: `0x${string}`;
  details: string;
  postedAt: number;
};

const KEY = "signalstake-channel-v1";
// Commit hashes written by the last seed load; lets a re-seed evict the
// previous deployment's entries (its nonce — and commitment — changes).
const SEED_KEY = "signalstake-seeded-v1";

function load(): Record<string, ChannelEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function save(store: Record<string, ChannelEntry>) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function channelInit() {
  fetch("/offchain-seed.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((seed: { signals: ChannelEntry[] } | null) => {
      if (!seed) return;
      const store = load();
      const fresh = new Set(seed.signals.map((s) => s.commitHash));
      let prev: string[] = [];
      try { prev = JSON.parse(localStorage.getItem(SEED_KEY) || "[]"); } catch { /* first run */ }
      let changed = false;
      for (const h of prev) {
        if (!fresh.has(h as `0x${string}`) && store[h]) { delete store[h]; changed = true; }
      }
      for (const s of seed.signals) {
        if (!store[s.commitHash]) {
          store[s.commitHash] = { ...s, postedAt: s.postedAt ?? 0 };
          changed = true;
        }
      }
      localStorage.setItem(SEED_KEY, JSON.stringify([...fresh]));
      if (changed) save(store);
    })
    .catch(() => {});
}

export function channelAdd(entry: ChannelEntry) {
  const store = load();
  store[entry.commitHash] = entry;
  save(store);
}

export function channelList(): ChannelEntry[] {
  return Object.values(load()).sort((a, b) => b.postedAt - a.postedAt);
}

export function channelByCommit(commitHash: `0x${string}`): ChannelEntry | undefined {
  return load()[commitHash];
}
