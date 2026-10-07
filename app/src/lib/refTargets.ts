import type { PersonaId } from "./chain";

// Guide references → where they live in the dashboard. persona switches the
// acting-as role first; panel is a data-tut anchor; text matches a button
// inside that panel by prefix (fallback: the panel itself glows).
export type RefTarget = { persona?: PersonaId; panel: string; text?: string };

export const REF_TARGETS: Record<string, RefTarget> = {
  "Deposit stake": { persona: "telco", panel: "stake-vault", text: "Deposit stake" },
  "Seal & post commitment": { persona: "telco", panel: "composer", text: "Seal & post commitment" },
  "Fund pool": { persona: "bank", panel: "pool", text: "Fund pool" },
  "Use this signal": { persona: "bank", panel: "signals", text: "Use this signal" },
  "Use this signal (hold payment, open case)": { persona: "bank", panel: "signals", text: "Use this signal" },
  "Try case on expired signal": { persona: "bank", panel: "signals", text: "Try case on expired signal" },
  "Vote prevented": { persona: "bank", panel: "cases", text: "Vote prevented" },
  "Vote false alarm": { persona: "bank", panel: "cases", text: "Vote false alarm" },
  "Second: prevented": { persona: "confirmer", panel: "cases", text: "Second: prevented" },
  "Second: false alarm": { persona: "confirmer", panel: "cases", text: "Second: false alarm" },
  "Finalize": { panel: "cases", text: "Finalize" },
  "Settle — pay / slash": { panel: "cases", text: "Settle" },
  "Settle": { panel: "cases", text: "Settle" },
  "Set": { persona: "regulator", panel: "params", text: "Set" },
  "add": { persona: "regulator", panel: "members", text: "add" },
  "remove": { persona: "regulator", panel: "members", text: "remove" },
  "Dispute": { panel: "cases", text: "Dispute" },
};

let current: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export function clearGlow() {
  if (current) { current.classList.remove("ref-glow"); current = null; }
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
}

function armDismiss() {
  // The glow stops on the next action of any kind: a click, a key, or 20s.
  const stop = () => clearGlow();
  document.addEventListener("pointerdown", stop, { once: true, capture: true });
  document.addEventListener("keydown", stop, { once: true, capture: true });
  dismissTimer = setTimeout(clearGlow, 20000);
}

// Glow the dashboard element a guide reference points at. Retries briefly in
// case the persona switch is still rendering; falls back to the rail.
export function glowRef(label: string, depth = 0): boolean {
  const t = REF_TARGETS[label];
  if (!t) return false;
  clearGlow();
  const panel = document.querySelector(`[data-tut="${t.panel}"]`) as HTMLElement | null;
  let el: HTMLElement | null = null;
  if (panel && t.text) {
    const btn = Array.from(panel.querySelectorAll("button"))
      .find((b) => (b.textContent ?? "").trim().toLowerCase().startsWith(t.text!.toLowerCase()));
    el = btn ?? panel;
  } else {
    el = panel;
  }
  if (!el) {
    if (depth < 2) { setTimeout(() => glowRef(label, depth + 1), 350); return false; }
    el = document.querySelector('[data-tut="rail"]') as HTMLElement | null;
    if (!el) return false;
  }
  el.classList.add("ref-glow");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  current = el;
  armDismiss();
  return true;
}
