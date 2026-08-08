// api/decision-state.js
//
// Read or seed the server-owned state for one decision.
//
//   GET  /api/decision-state?id=<decisionId>            read it
//   GET  /api/decision-state?id=<decisionId>&view=risk  read it, scored
//   POST /api/decision-state { id, decision, assumptions, evidence }
//                                                       seed or replace it
//
// Reads are open so a rendered widget can fetch its own data without carrying
// the Live Mode passphrase into browser-visible markup. Writes are gated.

import { readDecisionState, writeDecisionState } from "./_state.js";
import { buildRiskBoard } from "./_risk.js";

function gate(req, res) {
  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (required && req.headers["x-live-passphrase"] !== required) {
    res.status(401).json({ ok: false, error: "Passphrase required." });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ ok: false, error: "Missing id." });
    try {
      const state = await readDecisionState(id);
      if (!state) {
        return res.status(404).json({ ok: false, error: `No decision "${id}".` });
      }
      // The scored view is derived here rather than in the widget so the
      // scoring has one implementation, and so the fallback path a widget uses
      // when it misses the tool result returns exactly what the tool would.
      if (req.query?.view === "risk") {
        return res.status(200).json({ ok: true, board: buildRiskBoard(state, id) });
      }
      return res.status(200).json({ ok: true, state });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (req.method === "POST") {
    if (!gate(req, res)) return;
    const { id, decision, assumptions, evidence } = req.body ?? {};
    if (!id || !decision || !Array.isArray(assumptions)) {
      return res
        .status(400)
        .json({ ok: false, error: "Need id, decision and assumptions." });
    }
    try {
      const state = await writeDecisionState(id, {
        decision,
        assumptions: assumptions.map((a) => ({ revision: 1, ...a })),
        evidence: Array.isArray(evidence) ? evidence : [],
        reports: [],
        source: "app",
      });
      return res.status(200).json({ ok: true, state });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
