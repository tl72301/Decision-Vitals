// src/lib/api.js
//
// Single entry point for running a specialist. In Demo Mode the call is served
// by the replay engine (recorded real runs, zero API calls). In Live Mode it
// goes to /api/agent with the passphrase header, which the server re-checks.

import { isDemo, getPassphrase } from "./mode.js";
import { replayAgent } from "./replay.js";

/**
 * Run one specialist and return its parsed JSON output.
 * Throws an Error with a readable message on any failure.
 * @param {string} agent  specialist slug (e.g. "intake", "evidence_review")
 * @param {object|string} payload  the input for that specialist
 * @param {{decisionId?: string}} [opts]  decisionId enables Demo Mode replay
 * @returns {Promise<object>}
 */
export async function runAgent(agent, payload, { decisionId } = {}) {
  if (isDemo()) {
    return replayAgent(agent, decisionId);
  }

  let res;
  try {
    res = await fetch("/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-live-passphrase": getPassphrase(),
      },
      body: JSON.stringify({ agent, payload }),
    });
  } catch {
    throw new Error(`Could not reach the ${agent} agent (network error).`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`The ${agent} agent returned a non-JSON response (${res.status}).`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data?.error || `The ${agent} agent failed (${res.status}).`);
  }
  return data.output;
}

/** Verify a Live Mode passphrase with the server. Returns { ok, configured }. */
export async function verifyLivePassphrase(passphrase) {
  const res = await fetch("/api/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  try {
    return await res.json();
  } catch {
    return { ok: false, error: `Verification failed (${res.status}).` };
  }
}

/**
 * Owner-pull: fetch labeled emails from Gmail (server-side) and return them as
 * evidence-ready items. Live Mode only. Returns { ok, configured, items, ... }.
 */
export async function pullGmail() {
  const res = await fetch("/api/gmail-pull", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-live-passphrase": getPassphrase(),
    },
    body: "{}",
  });
  try {
    return await res.json();
  } catch {
    return { ok: false, error: `Gmail pull failed (${res.status}).` };
  }
}
