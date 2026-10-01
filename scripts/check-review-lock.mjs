// scripts/check-review-lock.mjs
//
// Asserts that overlapping polls of one review task cannot pay for the same
// stage twice, or save the same report twice.
//
// A review advances one stage per poll, and a stage takes 10 to 50 seconds
// while polls are suggested every 1.5. A host polling tasks/get, a Progress
// Board polling review_progress, or a retry after a timeout can all overlap.
// Before the per-task lock, each overlapping poll started its own Managed
// Agents session for the stage that was still running.
//
// A real MCP client over real HTTP, a Redis stub that honours SET NX, and a
// stubbed Managed Agents API that counts sessions. No credits are spent.
//
// Run: node scripts/check-review-lock.mjs   (exits non-zero on failure)

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const recorded = require("../src/data/recordedRuns.json");

const PASSPHRASE = "throwaway-test-passphrase";
process.env.LIVE_MODE_PASSPHRASE = PASSPHRASE;
process.env.ANTHROPIC_API_KEY = "throwaway-test-key";
process.env.KV_REST_API_URL = "https://fake-kv.example.com";
process.env.KV_REST_API_TOKEN = "tok";

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.error(`  FAIL ${label}\n         ${JSON.stringify(detail)}`);
    failures++;
  }
}

const { AGENTS } = await import(new URL("../api/_agents.js", import.meta.url));

const kv = new Map(); // key -> {value, expires}
const kvGet = (k) => {
  const e = kv.get(k);
  if (e && e.expires && e.expires < Date.now()) kv.delete(k);
  return kv.get(k)?.value ?? null;
};
const sessions = new Map();
const sessionLog = [];
const J = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url.toString());
  const method = init.method ?? "GET";
  if (u.origin === "https://fake-kv.example.com") {
    const [cmd, key, value, ...opts] = JSON.parse(init.body);
    if (cmd === "GET") return J({ result: kvGet(key) });
    if (cmd === "DEL") return kv.delete(key), J({ result: 1 });
    if (cmd === "SET") {
      const nx = opts.includes("NX");
      const px = opts.indexOf("PX");
      if (nx && kvGet(key) != null) return J({ result: null });
      kv.set(key, { value, expires: px >= 0 ? Date.now() + Number(opts[px + 1]) : 0 });
      return J({ result: "OK" });
    }
    return J({ result: null });
  }
  if (u.hostname !== "api.anthropic.com") return realFetch(url, init);
  const p = u.pathname;
  if (p === "/v1/agents") return J({ data: AGENTS.map((a) => ({ id: `agent_${a.key}`, name: a.name })), has_more: false });
  if (p === "/v1/environments") return J(method === "GET" ? { data: [] } : { id: "env_stub" });
  if (p === "/v1/sessions" && method === "POST") {
    const slug = JSON.parse(init.body).agent.replace(/^agent_/, "");
    const id = `sess_${sessions.size + 1}`;
    sessions.set(id, slug);
    sessionLog.push(slug);
    return J({ id });
  }
  const m = p.match(/^\/v1\/sessions\/([^/]+)(\/events)?$/);
  if (m) {
    if (!m[2]) return J({ status: "idle" });
    if (method === "POST") return J({});
    const text = JSON.stringify(recorded["sample-cafe"][sessions.get(m[1])]);
    return J({ data: [{ processed_at: "1", content: [{ type: "text", text }] }] });
  }
  return J({ error: "not stubbed" }, 404);
};

const { createServer } = await import("node:http");
const handler = (await import(new URL("../api/mcp.js", import.meta.url))).default;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = undefined; } }
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
  try { await handler(req, res); } catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end(String(e)); } }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/api/mcp?key=${encodeURIComponent(PASSPHRASE)}`;

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
const client = new Client({ name: "lock-probe", version: "1.0.0" }, { capabilities: {} });

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const started = await client.callTool({ name: "watch_review", arguments: { decisionId: "sample-cafe" } });
  const taskId = started.structuredContent?.taskId;
  check("watch_review starts a task", !!taskId, started);

  const poll = () => client.callTool({ name: "review_progress", arguments: { taskId } });

  console.log("three overlapping polls per round:");
  await Promise.all([poll(), poll(), poll()]);
  check("first round runs one session, not three", sessionLog.length === 1, sessionLog);

  let last = null;
  for (let round = 0; round < 12; round++) {
    const results = await Promise.all([poll(), poll(), poll()]);
    last = results.map((r) => r.structuredContent?.taskStatus);
    if (last.every((s) => s !== "working")) break;
  }
  check("the review completes", last?.includes("completed"), last);
  check("one session per stage, in order", sessionLog.join() === "evidence_review,challenge,risk_ranking,reporter", sessionLog);
  const state = JSON.parse(kvGet("dv:decision:sample-cafe") ?? "null");
  check("one report saved", state?.reports?.length === 1, state?.reports?.map((r) => r.runNumber));
  check("no lock left behind", ![...kv.keys()].some((k) => k.endsWith(":advance")), [...kv.keys()]);
} catch (e) {
  console.error("FAILED:", e?.message ?? String(e));
  failures++;
}

server.close();
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
