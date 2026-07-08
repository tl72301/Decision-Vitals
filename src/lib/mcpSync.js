// src/lib/mcpSync.js
//
// Browser side of the MCP bridge. While the app is in Live Mode it
// periodically pushes a compact snapshot of decisions to /api/sync (so the
// MCP server can list them) and ingests any evidence that agents filed via
// MCP since the last sync. Demo Mode never syncs and never calls the network.

import { isDemo, getPassphrase, subscribeMode } from "./mode.js";
import {
  listDecisions,
  assumptionsByDecision,
  evidenceByDecision,
  createEvidence,
  subscribe,
} from "./store.js";

const SYNC_INTERVAL_MS = 20_000;

let timer = null;
let started = false;
let syncing = false;

function snapshot() {
  return listDecisions().map((d) => ({
    id: d.id,
    title: d.title,
    statement: d.statement,
    healthGrade: d.healthGrade,
    evidenceCount: evidenceByDecision(d.id).length,
    assumptions: assumptionsByDecision(d.id).map((a) => ({
      id: a.id,
      text: a.text,
      tier: a.tier,
      status: a.status,
      signpost: a.signpost,
    })),
  }));
}

async function syncOnce() {
  if (isDemo() || syncing) return;
  syncing = true;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-live-passphrase": getPassphrase(),
      },
      body: JSON.stringify({ decisions: snapshot() }),
    });
    const data = await res.json();
    if (data?.ok && Array.isArray(data.inbox)) {
      for (const ev of data.inbox) {
        if (!ev?.decisionId || !ev?.text) continue;
        createEvidence({
          decisionId: ev.decisionId,
          text: ev.text,
          sourceType: ev.sourceType,
          date: ev.date,
        });
      }
    }
  } catch {
    // Offline or unconfigured storage: try again next tick.
  } finally {
    syncing = false;
  }
}

function applyMode() {
  if (!isDemo() && !timer) {
    syncOnce();
    timer = setInterval(syncOnce, SYNC_INTERVAL_MS);
  } else if (isDemo() && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Start the bridge; safe to call more than once. */
export function startMcpSync() {
  if (started) return;
  started = true;
  applyMode();
  subscribeMode(applyMode);
  // Push promptly after local writes (new evidence counts, status changes),
  // debounced so a burst of store writes becomes one sync.
  let debounce = null;
  subscribe(() => {
    if (isDemo()) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncOnce, 2_000);
  });
}
