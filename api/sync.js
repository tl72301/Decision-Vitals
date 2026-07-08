// api/sync.js
//
// The browser side of the MCP bridge. The app calls this in Live Mode only:
//   POST { decisions: [...] }  with the x-live-passphrase header
// It stores the snapshot (so MCP tools can list real decisions) and returns
// any evidence that agents filed via MCP since the last sync, clearing the
// inbox on delivery so items are ingested exactly once.

import { kvConfigured, kvGetJson, kvSetJson, kvDel, KEYS } from "./_kv.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (required && req.headers["x-live-passphrase"] !== required) {
    return res.status(401).json({ ok: false, error: "Passphrase required." });
  }

  if (!kvConfigured()) {
    return res.status(200).json({
      ok: false,
      configured: false,
      inbox: [],
      error:
        "Storage not configured. Add the Upstash for Redis integration in Vercel to enable the MCP bridge.",
    });
  }

  try {
    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    await kvSetJson(KEYS.index, { decisions, updatedAt: new Date().toISOString() });

    const inbox = (await kvGetJson(KEYS.inbox)) ?? [];
    if (inbox.length > 0) await kvDel(KEYS.inbox);

    return res.status(200).json({ ok: true, configured: true, inbox });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
