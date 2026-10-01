// api/live.js
//
// Verifies the Live Mode passphrase against the LIVE_MODE_PASSPHRASE env var.
// This only unlocks the client toggle; /api/agent independently re-checks the
// passphrase on every call, so this route grants nothing by itself.
//
// With no passphrase configured, Live Mode stays locked: every live route
// refuses in that state (see ./_auth.js), so unlocking the toggle would only
// lead to failed runs.

import { denyLive } from "./_auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const denied = denyLive(String(req.body?.passphrase ?? ""), "Incorrect passphrase.");
  if (denied) {
    return res
      .status(denied.status)
      .json({ ok: false, configured: denied.status !== 503, error: denied.error });
  }
  return res.status(200).json({ ok: true, configured: true });
}
