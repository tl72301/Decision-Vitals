// scripts/check-live-auth.mjs
//
// Asserts every live route fails closed. With LIVE_MODE_PASSPHRASE unset, each
// one refuses with 503 and makes no outbound request; with it set, a missing,
// empty or wrong passphrase gets 401 and the correct one gets through.
//
// Before this check the gates read `if (required && supplied !== required)`,
// so a deployment with an API key but no passphrase ran paid agent sessions,
// rewrote agent definitions, and served the MCP endpoint to anyone.
//
// Outbound requests are stubbed and counted, so "refused before spending
// anything" is asserted rather than assumed. Throwaway values only.
//
// Run: node scripts/check-live-auth.mjs   (exits non-zero on failure)

const PASS = "throwaway-test-passphrase";
process.env.ANTHROPIC_API_KEY = "throwaway-test-key";
process.env.GOOGLE_CLIENT_ID = "throwaway-client";
process.env.GOOGLE_CLIENT_SECRET = "throwaway-secret";
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

let outbound = 0;
globalThis.fetch = async () => {
  outbound++;
  return { ok: false, status: 500, json: async () => ({}), text: async () => "stubbed" };
};

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.error(`  FAIL ${label}\n         ${JSON.stringify(detail)}`);
    failures++;
  }
}

const load = async (f) => (await import(new URL(`../api/${f}`, import.meta.url))).default;

async function call(handler, { method = "POST", url = "/", headers = {}, body = {}, query = {} }) {
  outbound = 0;
  const res = {
    statusCode: 200,
    body: null,
    setHeader() { return this; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(o) { this.body = o; return this; },
    end() { return this; },
  };
  await handler({ method, url, headers: { host: "localhost", ...headers }, query, body }, res);
  return { status: res.statusCode, body: res.body, outbound };
}

// How each route receives the passphrase.
const header = (key) => (key == null ? {} : { headers: { "x-live-passphrase": key } });
const query = (path) => (key) => ({ url: key == null ? path : `${path}?key=${encodeURIComponent(key)}` });

const ROUTES = [
  ["agent", "agent.js", (k) => ({ ...header(k), body: { agent: "intake", payload: { statement: "x" } } })],
  ["review", "review.js", (k) => ({ ...header(k), body: { decisionId: "sample-cafe" } })],
  ["sync", "sync.js", (k) => ({ ...header(k), body: { decisions: [] } })],
  ["gmail-pull", "gmail-pull.js", (k) => header(k)],
  ["decision-state POST", "decision-state.js", (k) => ({ ...header(k), body: { id: "d1", decision: { title: "t" }, assumptions: [] } })],
  ["setup", "setup.js", (k) => ({ method: "GET", ...query("/api/setup")(k) })],
  ["gmail-auth start", "gmail-auth.js", (k) => ({ method: "GET", ...query("/api/gmail-auth")(k) })],
  ["mcp ?key=", "mcp.js", (k) => ({ ...query("/api/mcp")(k), body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })],
  ["mcp bearer", "mcp.js", (k) => ({ url: "/api/mcp", headers: k == null ? {} : { authorization: `Bearer ${k}` }, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })],
  ["live", "live.js", (k) => ({ body: k == null ? {} : { passphrase: k } })],
];

console.log("with LIVE_MODE_PASSPHRASE unset:");
delete process.env.LIVE_MODE_PASSPHRASE;
for (const [name, file, req] of ROUTES) {
  const h = await load(file);
  for (const key of [undefined, "", "anything"]) {
    const r = await call(h, req(key));
    check(`${name}, key ${JSON.stringify(key ?? null)} -> 503, nothing sent`, r.status === 503 && r.outbound === 0, r);
  }
}
const live = await load("live.js");
let r = await call(live, { body: { passphrase: "" } });
check("live does not report ok, so the toggle stays locked", r.body?.ok === false, r.body);

console.log("\nwith LIVE_MODE_PASSPHRASE set:");
process.env.LIVE_MODE_PASSPHRASE = PASS;
for (const [name, file, req] of ROUTES) {
  if (file === "mcp.js") continue; // the correct-key path is covered over real HTTP below
  const h = await load(file);
  for (const key of [undefined, "", "wrong", PASS.toUpperCase()]) {
    const r = await call(h, req(key));
    check(`${name}, key ${JSON.stringify(key ?? null)} -> 401, nothing sent`, r.status === 401 && r.outbound === 0, r);
  }
  const ok = await call(h, req(PASS));
  check(`${name}, correct key -> past the gate`, ok.status !== 401 && ok.status !== 503, ok);
}
const mcp = await load("mcp.js");
for (const [name, , req] of ROUTES.filter(([, f]) => f === "mcp.js")) {
  for (const key of [undefined, "", "wrong"]) {
    const r = await call(mcp, req(key));
    check(`${name}, key ${JSON.stringify(key ?? null)} -> 401`, r.status === 401, r);
  }
}
console.log("  (mcp with the correct key: see check-mcp-client.mjs)");

console.log("\npublic by design:");
delete process.env.LIVE_MODE_PASSPHRASE;
const state = await load("decision-state.js");
r = await call(state, { method: "GET", query: { id: "sample-cafe" } });
check("decision-state GET (read-only, by decision id) still answers", r.status === 200, r.status);
r = await call(await load("health.js"), { method: "GET" });
check("health still answers", r.status === 200, r);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
