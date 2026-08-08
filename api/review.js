// api/review.js
//
// Runs a decision's review server-side. This is what lets a widget in a Claude
// conversation trigger a review: there is no browser tab to own the loop.
//
// POST { decisionId }
//
// Synchronous by design for this slice. A full run is four Managed Agents
// sessions and can exceed a 60s function limit, so maxDuration is raised. On a
// Vercel plan capped at 60s this route will time out on slow runs; that is the
// problem the Tasks extension solves, and it is deliberately out of slice.

import { runReviewForDecision } from "./_review-core.js";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (required && req.headers["x-live-passphrase"] !== required) {
    return res.status(401).json({ ok: false, error: "Passphrase required." });
  }

  const decisionId = req.body?.decisionId;
  if (!decisionId) {
    return res.status(400).json({ ok: false, error: "Missing decisionId." });
  }

  try {
    const report = await runReviewForDecision(decisionId);
    return res.status(200).json({ ok: true, report });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
