// scripts/check-grading.mjs
//
// Feeds deliberately contradictory model outputs through BOTH review paths and
// asserts the grading rules hold in code, whatever the models said:
//
//   browser: buildAndSaveReport() in src/lib/review.js, over a localStorage shim
//   server:  finishReview() / advanceReview() in api/_review-core.js, over a
//            stubbed Redis and a stubbed Managed Agents API
//
// The rules (src/lib/grading.js): the grade is derived from statuses, never
// taken from the Reporter; a critical assumption with strong contradicting
// evidence cannot be holding; an incomplete or inconsistent ranking is rejected
// before anything is saved, and before the Reporter is paid for; a quote that
// is not in the cited evidence is not shown as a receipt.
//
// It drives the public entry points rather than the rules module, so it can be
// run against code that predates the rules and show what it let through.
//
// No network, no credits, throwaway values only.
// Run: node scripts/check-grading.mjs   (exits non-zero on failure)

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const samples = require("../src/data/samples.json").decisions;
const recorded = require("../src/data/recordedRuns.json");

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
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- stubs: browser storage, Redis, Managed Agents -------------------------

const mem = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
};

const kv = new Map();
const sessions = new Map(); // sessionId -> agent slug
const sessionLog = []; // slugs, in the order sessions were created
let agentOutputs = {}; // slug -> JSON the stubbed agent replies with

const J = (o, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => o,
  text: async () => JSON.stringify(o),
});

const { AGENTS } = await import(new URL("../api/_agents.js", import.meta.url));

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url.toString());
  const method = init.method ?? "GET";
  if (u.origin === "https://fake-kv.example.com") {
    const [cmd, key, value] = JSON.parse(init.body);
    if (cmd === "GET") return J({ result: kv.get(key) ?? null });
    if (cmd === "SET") return kv.set(key, value), J({ result: "OK" });
    if (cmd === "DEL") return kv.delete(key), J({ result: 1 });
    return J({ result: null });
  }
  if (u.hostname !== "api.anthropic.com") throw new Error(`unexpected fetch ${u}`);
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
    const text = JSON.stringify(agentOutputs[sessions.get(m[1])]);
    return J({ data: [{ processed_at: "1", content: [{ type: "text", text }] }] });
  }
  // Anything else (the memory store) fails; memory is optional by design.
  return J({ error: "not stubbed" }, 404);
};

const store = await import(new URL("../src/lib/store.js", import.meta.url));
const { buildAndSaveReport } = await import(new URL("../src/lib/review.js", import.meta.url));
const core = await import(new URL("../api/_review-core.js", import.meta.url));

// ---- the two paths, behind one interface -----------------------------------

/** Seed a sample exactly as the app's loader does, then grade `outputs`. */
function browserPath(id, outputs) {
  store.resetState();
  const { assumptions = [], evidence = [], ...decision } = samples.find((s) => s.id === id);
  store.createDecision(decision);
  store.createAssumptions(
    assumptions.map((a) => ({ ...a, decisionId: id, status: "untested", userEdited: false }))
  );
  for (const e of evidence) store.createEvidence({ ...e, decisionId: id });
  const before = JSON.stringify(store.readState());
  const run = store.createAgentRun({ decisionId: id, steps: [] });
  try {
    const report = buildAndSaveReport(id, run, clone(outputs));
    const status = Object.fromEntries(store.assumptionsByDecision(id).map((a) => [a.id, a.status]));
    return { report, status, decisionGrade: store.getDecision(id).healthGrade };
  } catch (error) {
    store.deleteAgentRun(run.id);
    return { error, unchanged: JSON.stringify(store.readState()) === before };
  }
}

async function serverPath(id, outputs) {
  kv.clear();
  try {
    const report = await core.finishReview(id, clone(outputs));
    const state = JSON.parse(kv.get(`dv:decision:${id}`));
    const status = Object.fromEntries(state.assumptions.map((a) => [a.id, a.status]));
    return { report, status, decisionGrade: report.healthGrade };
  } catch (error) {
    return { error, unchanged: !kv.has(`dv:decision:${id}`) };
  }
}

const PATHS = [
  ["browser", browserPath],
  ["server", serverPath],
];

// ---- 1. recorded demo runs grade exactly as recorded ----------------------

console.log("recorded demo runs are unchanged:");
for (const [name, path] of PATHS) {
  for (const s of samples) {
    const rec = recorded[s.id];
    const r = await path(s.id, rec);
    const recStatus = Object.fromEntries(rec.risk_ranking.rankings.map((x) => [x.assumptionId, x.status]));
    check(`${name} ${s.id}: grade is the recorded ${rec.reporter.healthGrade}`, r.report?.healthGrade === rec.reporter.healthGrade, r.report?.healthGrade ?? String(r.error));
    check(`${name} ${s.id}: statuses as recorded`, JSON.stringify(r.status) === JSON.stringify(recStatus), r.status);
    const got = (r.report?.findings ?? []).map((f) => [f.assumptionId, f.status, f.receipts]);
    const want = rec.reporter.findings.map((f) => [f.assumptionId, f.status, f.receipts]);
    check(`${name} ${s.id}: findings and receipts as recorded`, JSON.stringify(got) === JSON.stringify(want), { got, want });
    check(`${name} ${s.id}: no overrides, no dropped quotes`, !(r.report?.findings ?? []).some((f) => f.override || f.droppedReceipts) && !r.report?.reporterHealthGrade, r.report?.findings);
  }
}

// ---- 2. contradictory outputs ----------------------------------------------
//
// sample-cafe: a1, a2 critical (load_bearing); a3, a4 supporting. e2 is a
// strong contradiction of a2 in the recorded Evidence Review.

const ID = "sample-cafe";
const base = recorded[ID];
const evidenceText = Object.fromEntries(samples.find((s) => s.id === ID).evidence.map((e) => [e.id, e.text]));
const rank = (statuses) => ({
  rankings: Object.entries(statuses).map(([assumptionId, status]) => ({
    assumptionId, status, confidence: "high", rationale: `ranked ${status}`, evidenceIds: [],
  })),
});
const variant = (patch) => ({ ...clone(base), ...patch });
const allHolding = { "sample-cafe-a1": "holding", "sample-cafe-a2": "holding", "sample-cafe-a3": "holding", "sample-cafe-a4": "holding" };
const { ["sample-cafe-a1"]: _omitted, ...threeOfFour } = allHolding; // a1 is critical

for (const [name, path] of PATHS) {
  console.log(`\n${name} path, contradictory outputs:`);

  // The reproduction: Reporter says healthy over an invalidated critical assumption.
  let r = await path(ID, variant({
    risk_ranking: rank({ ...allHolding, "sample-cafe-a2": "invalidated" }),
    reporter: { ...clone(base.reporter), healthGrade: "healthy" },
  }));
  check("Reporter 'healthy' over an invalidated critical assumption -> at_risk", r.report?.healthGrade === "at_risk", r.report?.healthGrade ?? String(r.error));
  check("  the decision itself is stored at_risk", r.decisionGrade === "at_risk", r.decisionGrade);
  check("  the Reporter's disagreeing grade is kept as a record", r.report?.reporterHealthGrade === "healthy", r.report?.reporterHealthGrade);

  r = await path(ID, variant({
    risk_ranking: rank({ ...allHolding, "sample-cafe-a3": "invalidated" }),
    reporter: { ...clone(base.reporter), healthGrade: "at_risk" },
  }));
  check("Reporter 'at_risk' when only a supporting one is invalidated -> watch", r.report?.healthGrade === "watch", r.report?.healthGrade ?? String(r.error));

  // The hard rule: strong contradicting evidence, ranked holding anyway.
  r = await path(ID, variant({ risk_ranking: rank(allHolding), reporter: { ...clone(base.reporter), healthGrade: "healthy" } }));
  check("critical + strong contradiction ranked 'holding' -> not holding", r.status?.["sample-cafe-a2"] !== "holding" && r.status?.["sample-cafe-a2"] != null, r.status ?? String(r.error));
  check("  set to needs_review", r.status?.["sample-cafe-a2"] === "needs_review", r.status);
  check("  grade follows the corrected status (watch)", r.report?.healthGrade === "watch", r.report?.healthGrade);
  const f2 = r.report?.findings?.find((f) => f.assumptionId === "sample-cafe-a2");
  check("  the finding shows the corrected status", f2?.status === "needs_review", f2);
  check("  the override is recorded with its evidence", f2?.override?.from === "holding" && f2?.override?.evidenceIds?.includes("sample-cafe-e2"), f2?.override);
  check("  an unaffected assumption keeps its ranking", r.status?.["sample-cafe-a1"] === "holding", r.status);

  // A strong contradiction that cites evidence not on this decision changes nothing.
  r = await path(ID, variant({
    evidence_review: { mappings: [{ evidenceId: "made-up-e9", assumptionId: "sample-cafe-a1", direction: "contradicts", strength: "strong", reading: "x" }] },
    risk_ranking: rank(allHolding),
    reporter: { ...clone(base.reporter), healthGrade: "healthy" },
  }));
  check("strong contradiction citing unknown evidence -> no override", r.status?.["sample-cafe-a1"] === "holding" && r.report?.healthGrade === "healthy", r.status ?? String(r.error));

  // Incomplete or inconsistent rankings are rejected, and nothing is saved.
  r = await path(ID, variant({ risk_ranking: rank(threeOfFour), reporter: { ...clone(base.reporter), healthGrade: "healthy" } }));
  check("a critical assumption left unranked -> rejected", !!r.error && /Risk Ranking/.test(r.error.message), r.report?.healthGrade ?? String(r.error));
  check("  nothing saved", r.unchanged === true, r.unchanged);

  r = await path(ID, variant({ risk_ranking: { rankings: [] } }));
  check("empty ranking -> rejected (no fallback to the Reporter's statuses)", !!r.error, r.report?.healthGrade ?? String(r.error));

  r = await path(ID, variant({ risk_ranking: rank({ ...allHolding, "sample-cafe-a3": "probably fine" }) }));
  check("an invalid status -> rejected", !!r.error, r.report?.healthGrade ?? String(r.error));

  r = await path(ID, variant({
    risk_ranking: { rankings: [...rank(allHolding).rankings, { assumptionId: "sample-cafe-a1", status: "invalidated", confidence: "high" }] },
  }));
  check("one assumption ranked two different ways -> rejected", !!r.error, r.report?.healthGrade ?? String(r.error));

  // The Reporter's findings follow the ranking, and its quotes must be real.
  r = await path(ID, variant({
    risk_ranking: rank({ ...allHolding, "sample-cafe-a2": "invalidated" }),
    reporter: {
      ...clone(base.reporter),
      healthGrade: "at_risk",
      findings: [
        { assumptionId: "sample-cafe-a2", status: "holding", rationale: "r", receipts: [
          { evidenceId: "sample-cafe-e2", quote: evidenceText["sample-cafe-e2"].split(" ").slice(0, 6).join(" ") },
          { evidenceId: "sample-cafe-e2", quote: "customers said they love the new prices" },
          { evidenceId: "made-up-e9", quote: "anything" },
        ] },
        { assumptionId: "not-an-assumption", status: "invalidated", rationale: "r", receipts: [] },
      ],
    },
  }));
  const fa2 = r.report?.findings?.find((f) => f.assumptionId === "sample-cafe-a2");
  check("a finding's status comes from the ranking, not the Reporter", fa2?.status === "invalidated", fa2 ?? String(r.error));
  check("  a verbatim quote is kept", fa2?.receipts?.length === 1 && fa2.receipts[0].evidenceId === "sample-cafe-e2", fa2?.receipts);
  check("  a fabricated quote and an unknown evidence id are dropped and counted", fa2?.droppedReceipts === 2, fa2?.droppedReceipts);
  check("  a finding for an unknown assumption is dropped", !r.report?.findings?.some((f) => f.assumptionId === "not-an-assumption"), r.report?.findings?.map((f) => f.assumptionId));
  check("  every ranked assumption still gets a finding", JSON.stringify((r.report?.findings ?? []).map((f) => f.assumptionId).sort()) === JSON.stringify(Object.keys(allHolding).sort()), r.report?.findings?.map((f) => f.assumptionId));
}

// ---- 3. an unusable ranking stops the review before the Reporter runs ------

console.log("\nserver pipeline, stage by stage:");
kv.clear();
sessionLog.length = 0;
agentOutputs = { ...clone(base), risk_ranking: rank(threeOfFour) };
let progress = { outputs: {} };
let stopped = null;
for (let i = 0; i < 5 && !stopped; i++) {
  try {
    const step = await core.advanceReview(ID, progress);
    progress = { outputs: step.outputs };
    if (step.done) break;
  } catch (e) {
    stopped = e;
  }
}
check("an incomplete ranking stops the pipeline", !!stopped && /Risk Ranking/.test(stopped.message), String(stopped));
check("  the Reporter is never run", !sessionLog.includes("reporter"), sessionLog);
check("  no report is saved", !kv.has(`dv:decision:${ID}`), [...kv.keys()]);

sessionLog.length = 0;
agentOutputs = clone(base);
progress = { outputs: {} };
let final = null;
for (let i = 0; i < 6 && !final; i++) {
  const step = await core.advanceReview(ID, progress);
  progress = { outputs: step.outputs };
  if (step.done) final = step.report;
}
check("a complete recorded run still finishes, one session per stage", final?.healthGrade === base.reporter.healthGrade && sessionLog.join() === "evidence_review,challenge,risk_ranking,reporter", { grade: final?.healthGrade, sessionLog });

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
