// api/review.js
//
// Runs a decision's review server-side. This is what lets a widget in a Claude
// conversation trigger a review: there is no browser tab to own the loop.
//
// POST { decisionId }
//
// Synchronous, and therefore limited by the platform. A full run is four
// Managed Agents sessions, which will usually exceed 60 seconds.
//
// maxDuration stays at 60 because that is the Vercel Hobby ceiling, and asking
// for more does not degrade gracefully: the build is REJECTED, so the whole
// deployment fails rather than this one route running short. A route that
// sometimes times out is worth far less than a site that will not deploy.
//
// The path that does work within 60s is the task in api/mcp.js: it runs one
// stage per poll, and a single stage fits comfortably. Prefer that for real
// runs; this route is the simple one-shot for local use and for clients that
// cannot poll.

import { runReviewForDecision } from "./_review-core.js";

export const config = { maxDuration: 60 };

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
