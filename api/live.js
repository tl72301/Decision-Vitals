// api/live.js
//
// Verifies the Live Mode passphrase against the LIVE_MODE_PASSPHRASE env var.
// This only unlocks the client toggle; /api/agent independently re-checks the
// passphrase on every call, so this route grants nothing by itself.

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (!required) {
    // Owner hasn't configured gating (e.g. a private preview). Allow, but say so.
    return res.status(200).json({ ok: true, configured: false });
  }

  const supplied = String(req.body?.passphrase ?? "");
  if (supplied === required) {
    return res.status(200).json({ ok: true, configured: true });
  }
  return res.status(401).json({ ok: false, configured: true, error: "Incorrect passphrase." });
}
