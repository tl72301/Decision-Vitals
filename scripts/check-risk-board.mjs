// scripts/check-risk-board.mjs
//
// Two checks, in order of how much they can catch:
//
//   1. The scoring arithmetic, asserted against a table of cases written out by
//      hand. If the numbers here and the numbers in _risk.js disagree, one of
//      them is wrong and the test says which.
//   2. The tool as a REAL MCP client sees it, over real HTTP. The last two bugs
//      in this project both passed unit tests and failed a real client, so the
//      client path is the one that counts.
//
// Run: node scripts/check-risk-board.mjs
// Exits non-zero on failure.

const PASSPHRASE = "local-test-passphrase";
process.env.LIVE_MODE_PASSPHRASE = PASSPHRASE;
process.env.KV_REST_API_URL = "https://fake-kv.example.com";
process.env.KV_REST_API_TOKEN = "tok";

const kv = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (url.toString() === "https://fake-kv.example.com") {
    const J = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    const [cmd, key, value] = JSON.parse(init.body);
    if (cmd === "GET") return J({ result: kv.get(key) ?? null });
    if (cmd === "SET") { kv.set(key, value); return J({ result: "OK" }); }
    return J({ result: null });
  }
  return realFetch(url, init);
};

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
    failures++;
  }
}

// ---- 1. the arithmetic ----------------------------------------------------

const { scoreAssumption, buildRiskBoard } = await import("/home/user/Decision-Vitals/api/_risk.js");

const s = (tier, status, confidence) =>
  scoreAssumption({ tier, status }, confidence ? { confidence } : undefined);

console.log("scoring:");
// The extremes, so a change to either end of either scale is caught.
check("critical + invalidated, high", s("load_bearing", "invalidated", "high"),
  { impact: 3, fragility: 4, exposure: 12, band: "high" });
check("minor + holding, high", s("lower_risk", "holding", "high"),
  { impact: 1, fragility: 1, exposure: 1, band: "contained" });

// A critical assumption that is genuinely holding is NOT a risk. If this ever
// lands above "contained" the board is just re-drawing the importance column.
check("critical + holding, high", s("load_bearing", "holding", "high"),
  { impact: 3, fragility: 1, exposure: 3, band: "contained" });

// ...but weak reassurance on a critical assumption is. This pair is the whole
// argument for carrying confidence through from Risk Ranking: same status,
// same importance, different band.
check("critical + holding, LOW", s("load_bearing", "holding", "low"),
  { impact: 3, fragility: 1.3, exposure: 3.9, band: "elevated" });

// Low confidence pulls a bad reading back toward "we don't really know",
// without ever making it benign.
check("critical + weakened, high", s("load_bearing", "weakened", "high"),
  { impact: 3, fragility: 3, exposure: 9, band: "high" });
check("critical + weakened, low", s("load_bearing", "weakened", "low"),
  { impact: 3, fragility: 2.7, exposure: 8.1, band: "high" });

// Never reviewed is not benign: it scores the same as an explicit needs_review.
check("critical + untested", s("load_bearing", "untested"),
  { impact: 3, fragility: 2, exposure: 6, band: "elevated" });
check("critical + needs_review", s("load_bearing", "needs_review"),
  { impact: 3, fragility: 2, exposure: 6, band: "elevated" });

// A missing confidence is taken at face value rather than penalised.
check("supporting + invalidated, no confidence", s("vulnerable", "invalidated"),
  { impact: 2, fragility: 4, exposure: 8, band: "high" });

// ---- 2. the board over a whole decision -----------------------------------

console.log("board:");
const board = buildRiskBoard({
  decision: { title: "T" },
  assumptions: [
    { id: "a1", text: "one", tier: "lower_risk", status: "holding" },
    { id: "a2", text: "two", tier: "load_bearing", status: "weakened" },
    { id: "a3", text: "three", tier: "vulnerable", status: "holding", outOfScope: true },
    { id: "a4", text: "four", tier: "vulnerable", status: "untested" },
  ],
  reports: [
    {
      runNumber: 2,
      createdAt: "2026-08-01T00:00:00.000Z",
      healthGrade: "watch",
      findings: [{ assumptionId: "a2", confidence: "high", rationale: "because" }],
    },
  ],
}, "d1");

check("ranked worst first", board.rows.map((r) => r.id), ["a2", "a4", "a1"]);
// Refs are assigned over the full list, so an out-of-scope assumption does not
// renumber the ones after it: a4 stays A4 even though A3 is not shown.
check("refs survive the exclusion", board.rows.map((r) => r.ref), ["A2", "A4", "A1"]);
check("out of scope is excluded, not hidden", board.excludedCount, 1);
check("total is the scored rows only", board.totalExposure, 14);
check("top share", board.topShare, 64);
check("rationale carried through", board.rows[0].rationale, "because");
check("reviewed", [board.reviewed, board.runNumber], [true, 2]);

const fresh = buildRiskBoard({
  decision: { title: "T" },
  assumptions: [{ id: "a1", text: "one", tier: "load_bearing", status: "untested" }],
}, "d2");
check("a never-reviewed decision still scores", [fresh.reviewed, fresh.rows[0].exposure], [false, 6]);

// ---- 3. through a real MCP client -----------------------------------------

const { createServer } = await import("node:http");
const handler = (await import("/home/user/Decision-Vitals/api/mcp.js")).default;

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

const { Client } = await import("/home/user/Decision-Vitals/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
const { StreamableHTTPClientTransport } = await import("/home/user/Decision-Vitals/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js");

console.log("client:");
const client = new Client({ name: "risk-probe", version: "1.0.0" }, { capabilities: {} });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  const listed = (await client.listResources()).resources;
  const resources = listed.map((r) => r.uri);
  check("risk-board resource is advertised", resources.includes("ui://decision-vitals/risk-board"), true);

  // A widget with no declared connectDomains gets connect-src 'none', so every
  // fetch it makes is blocked inside the iframe with no error the server ever
  // sees. Assert the declaration on both the listing and the read, and assert
  // the origin the widget will actually call matches it.
  for (const r of listed) {
    check(`${r.name}: csp declares an origin`,
      (r._meta?.ui?.csp?.connectDomains ?? []).length > 0, true);
    const content = (await client.readResource({ uri: r.uri })).contents[0];
    const declared = content._meta?.ui?.csp?.connectDomains ?? [];
    check(`${r.name}: read carries the same csp`, declared, r._meta.ui.csp.connectDomains);
    const injected = (content.text.match(/const API_ORIGIN = "([^"]*)"/) || [])[1];
    if (injected !== undefined) {
      check(`${r.name}: fetch origin is allowed by its own csp`,
        declared.includes(injected), true);
    }
  }

  const tools = (await client.listTools()).tools;
  const tool = tools.find((t) => t.name === "open_risk_board");
  check("open_risk_board is advertised", !!tool, true);
  check("tool points at the widget", tool?._meta?.["openai/outputTemplate"] ?? tool?._meta?.ui?.resourceUri,
    "ui://decision-vitals/risk-board");

  const call = await client.callTool({ name: "open_risk_board", arguments: { decisionId: "sample-cafe" } });
  const sc = call.structuredContent;
  check("structuredContent carries a board", !!sc?.board, true);
  check("every row is scored", sc?.board?.rows?.every((r) => typeof r.exposure === "number"), true);
  check("rows are ordered worst first",
    sc?.board?.rows?.every((r, i, xs) => i === 0 || xs[i - 1].exposure >= r.exposure), true);
  // No fallback ref here on purpose: a board with no rows should fail this,
  // not slip through on a sentinel that happens not to match.
  const topRef = sc?.board?.rows?.[0]?.ref;
  check("there is a top row to name", typeof topRef, "string");
  check("the text summary names the top row",
    call.content?.[0]?.text?.includes(topRef), true);

  // The widget's fallback path must return the same shape as the tool, or a
  // missed notification produces a subtly different board.
  const stateHandler = (await import("/home/user/Decision-Vitals/api/decision-state.js")).default;
  const captured = {};
  await stateHandler(
    { method: "GET", query: { id: "sample-cafe", view: "risk" }, headers: {} },
    {
      status(c) { captured.code = c; return this; },
      json(o) { captured.body = o; return this; },
      setHeader() { return this; },
    }
  );
  check("the fallback route returns the same board",
    JSON.stringify(captured.body?.board) === JSON.stringify(sc.board), true);
} catch (e) {
  console.error("FAILED:", e?.message ?? String(e));
  if (e?.cause) console.error("CAUSE:", String(e.cause).slice(0, 300));
  failures++;
}

server.close();
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
