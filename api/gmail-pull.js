// api/gmail-pull.js
//
// Owner-only Gmail pull. Fetches emails the owner labeled with the evidence
// label (default "decision-evidence"), turns each into an evidence-ready item,
// and returns them; the app files them against the decision the owner pulled
// from. Each message is delivered once: processed ids are remembered in KV.
//
// Gated by the Live Mode passphrase like every other write path. The Google
// refresh token is read only here on the server.

import {
  gmailConfigured,
  getAccessToken,
  listLabeledMessageIds,
  getMessage,
} from "./_gmail.js";
import { kvConfigured, kvGetJson, kvSetJson } from "./_kv.js";

const PROCESSED_KEY = "dv:gmail:processed";
const MAX_PER_PULL = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (required && req.headers["x-live-passphrase"] !== required) {
    return res.status(401).json({ ok: false, error: "Passphrase required." });
  }

  if (!gmailConfigured()) {
    return res.status(200).json({
      ok: false,
      configured: false,
      error:
        "Gmail is not connected. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel (see the README).",
    });
  }
  if (!kvConfigured()) {
    return res.status(200).json({
      ok: false,
      configured: false,
      error: "Storage is not configured; the Upstash integration is required.",
    });
  }

  try {
    const label = process.env.GMAIL_LABEL || "decision-evidence";
    const accessToken = await getAccessToken();
    const ids = await listLabeledMessageIds(accessToken, label, 20);

    const processed = (await kvGetJson(PROCESSED_KEY)) ?? [];
    const fresh = ids.filter((id) => !processed.includes(id)).slice(0, MAX_PER_PULL);

    const items = [];
    for (const id of fresh) {
      const m = await getMessage(accessToken, id);
      if (!m.body && !m.subject) continue;
      items.push({
        text: `Email from ${m.from || "unknown sender"}${m.subject ? `, "${m.subject}"` : ""}: ${m.body}`,
        sourceType: "email",
        date: m.date,
        gmailId: id,
      });
    }

    await kvSetJson(PROCESSED_KEY, [...processed, ...fresh].slice(-500));

    return res.status(200).json({
      ok: true,
      configured: true,
      label,
      pulled: items.length,
      remaining: Math.max(0, ids.length - processed.length - fresh.length),
      items,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
