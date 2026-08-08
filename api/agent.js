// api/agent.js
//
// Runs one specialist as a Managed Agents session and returns its parsed JSON.
// The browser pipeline calls this once per stage. The server-side pipeline in
// api/review.js drives the same stages directly via ./_run-agent.js.
//
// POST { agent: "<slug>", payload: <object|string> }

import {
  requireApiKey,
  agentByKey,
  resolveAgentIds,
  resolveEnvironmentId,
} from "./_agents.js";
import { runOneAgent } from "./_run-agent.js";

export const config = { maxDuration: 60 };

const DEADLINE_MS = 55_000; // stay under the 60s function limit

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Live Mode gate: when LIVE_MODE_PASSPHRASE is set, every real agent run
  // must present it. Demo Mode never reaches this route.
  const requiredPassphrase = process.env.LIVE_MODE_PASSPHRASE;
  if (requiredPassphrase && req.headers["x-live-passphrase"] !== requiredPassphrase) {
    return res.status(401).json({
      ok: false,
      error: "Live Mode requires the correct passphrase. Unlock it via the header toggle.",
    });
  }

  const body = req.body ?? {};
  const { agent: agentSlug, payload } = body;
  if (!agentSlug || !agentByKey(agentSlug)) {
    return res
      .status(400)
      .json({ ok: false, error: `Unknown agent "${agentSlug}".` });
  }
  if (payload === undefined || payload === null) {
    return res.status(400).json({ ok: false, error: "Missing payload." });
  }

  let apiKey;
  try {
    apiKey = requireApiKey();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  let sessionId;
  try {
    const [agentIds, environmentId] = await Promise.all([
      resolveAgentIds(apiKey),
      resolveEnvironmentId(apiKey),
    ]);
    const agentId = agentIds[agentSlug];
    if (!agentId) {
      return res.status(409).json({
        ok: false,
        error: `Agent "${agentSlug}" is not registered yet. Call /api/setup first.`,
      });
    }

    const result = await runOneAgent({
      apiKey,
      agentSlug,
      agentId,
      environmentId,
      payload,
      deadline: Date.now() + DEADLINE_MS,
    });
    sessionId = result.sessionId;

    return res
      .status(200)
      .json({ ok: true, agent: agentSlug, sessionId, output: result.output });
  } catch (e) {
    // 502: the pipeline reached the platform but the run failed — the frontend
    // surfaces this as an error card.
    return res
      .status(502)
      .json({ ok: false, agent: agentSlug, sessionId, error: String(e?.message || e) });
  }
}
