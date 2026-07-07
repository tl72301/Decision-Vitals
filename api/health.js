// Vercel serverless function (Node runtime).
// Simple health check that proves the /api folder is wired up.
export default function handler(req, res) {
  res.status(200).json({ ok: true, service: "decision-vitals", ts: Date.now() });
}
