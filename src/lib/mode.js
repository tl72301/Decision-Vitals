// src/lib/mode.js
//
// Demo/Live mode state. The app defaults to Demo Mode everywhere: recorded
// agent runs are replayed with zero API calls. Live Mode runs real Managed
// Agents sessions and is gated by a passphrase that the SERVER re-checks on
// every /api/agent call; the client-side flag is convenience, not security.

const KEY = "decision_vitals_mode";

const listeners = new Set();

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.mode === "demo" || parsed.mode === "live")) return parsed;
  } catch {
    /* fall through */
  }
  return { mode: "demo", passphrase: "" };
}

export function getModeState() {
  return read();
}

export function isDemo() {
  return read().mode !== "live";
}

export function getPassphrase() {
  return read().passphrase ?? "";
}

export function setMode(mode, passphrase = "") {
  window.localStorage.setItem(KEY, JSON.stringify({ mode, passphrase }));
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore broken listeners */
    }
  }
}

/** Subscribe to mode changes. Returns an unsubscribe function. */
export function subscribeMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
