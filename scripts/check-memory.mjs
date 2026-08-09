// scripts/check-memory.mjs
//
// Exercises cross-decision memory against a stubbed Managed Agents API, so the
// retrieval rule, the render, the create/409/update path and the "memory never
// breaks a review" guarantee are all checked without spending credits.
//
// What this CANNOT check is whether the real memory-store endpoints accept
// these bodies. That needs one live run — see docs/phase-0-findings.md.
//
// Run: node scripts/check-memory.mjs

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.KV_REST_API_URL = "";

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${label}`);
  else { console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`); failures++; }
};

// ---- a stub of the memory-store API, recording what it was asked ----------

const store = new Map(); // path -> {id, path, content}
const calls = [];
let nextId = 1;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url.toString());
  if (u.hostname !== "api.anthropic.com") return realFetch(url, init);
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push(`${method} ${u.pathname}`);
  const J = (o, status = 200) => ({
    ok: status < 400, status,
    json: async () => o, text: async () => JSON.stringify(o),
  });

  if (u.pathname === "/v1/memory_stores" && method === "GET") {
    return J({ data: [{ id: "memstore_1", name: "decision-vitals-memory" }] });
  }
  if (u.pathname.endsWith("/memories") && method === "GET") {
    return J({ data: [...store.values()].map((m) => ({ ...m, type: "memory" })) });
  }
  if (u.pathname.endsWith("/memories") && method === "POST") {
    const hit = store.get(body.path);
    if (hit) {
      return J({ error: { type: "memory_path_conflict_error", conflicting_memory_id: hit.id } }, 409);
    }
    const mem = { id: `mem_${nextId++}`, path: body.path, content: body.content };
    store.set(body.path, mem);
    return J(mem);
  }
  if (method === "PATCH") {
    const id = u.pathname.split("/").pop();
    const mem = [...store.values()].find((m) => m.id === id);
    mem.content = body.content;
    return J(mem);
  }
  return J({}, 404);
};

const { renderMemory, rememberDecision, recallRelated, priorContext } =
  await import("/home/user/Decision-Vitals/api/_memory.js");

const decision = (id, title, statement, assumptionText) => ({
  decision: { id, title, statement },
  assumptions: [{ id: "a1", text: assumptionText, tier: "load_bearing", status: "weakened" }],
  reports: [],
});
const report = {
  createdAt: "2026-08-01T00:00:00.000Z",
  healthGrade: "watch",
  findings: [{
    assumptionId: "a1", status: "weakened", confidence: "high",
    rationale: "Counts came in under the model.",
    assumptionText: "Downtown foot traffic supports comparable sales.",
    assumptionTier: "load_bearing",
  }],
};

console.log("render:");
const md = renderMemory(decision("d1", "Second cafe", "Open downtown.", "x"), report);
check("names the decision id", md.includes("id: d1"), true);
check("carries status and confidence", md.includes("status: weakened, high confidence"), true);
check("carries the assumption as judged", md.includes("Downtown foot traffic"), true);
check("carries the reason", md.includes("Counts came in under the model."), true);

console.log("write:");
await rememberDecision("d1", decision("d1", "Second cafe", "Open downtown.", "x"), report);
check("created at the decision path", store.has("/decisions/d1.md"), true);
// Second write of the same decision must update, not duplicate.
await rememberDecision("d1", decision("d1", "Second cafe", "Open downtown REVISED.", "x"), report);
check("re-writing updates in place", store.size, 1);
check("409 is followed by a PATCH", calls.filter((c) => c.startsWith("PATCH")).length, 1);

console.log("recall:");
await rememberDecision(
  "d2",
  decision("d2", "Hire a pastry supplier", "Outsource baking to a wholesaler.", "y"),
  { ...report, findings: [{ ...report.findings[0], assumptionText: "Wholesale pastry margins hold." }] }
);

// A new decision that shares vocabulary with d1 and not with d2.
const fresh = decision("d3", "Third cafe downtown", "Open another downtown location.",
  "Downtown foot traffic supports comparable sales at a third site.");
const related = await recallRelated("d3", fresh);
check("finds the related decision", related.map((r) => r.decisionId), ["d1"]);
check("does not return the unrelated one", related.some((r) => r.decisionId === "d2"), false);

// A decision must never recall itself, even though its own memory matches best.
await rememberDecision("d3", fresh, report);
check("never recalls itself", (await recallRelated("d3", fresh)).some((r) => r.decisionId === "d3"), false);

console.log("payload:");
check("nothing related yields null, not []",
  priorContext(await recallRelated("d1", decision("d1", "zzz", "qqq", "vvv"))), null);
const ctx = priorContext(related);
check("prior context carries the id for attribution", ctx[0].decisionId, "d1");

console.log("degradation:");
// The whole point: a broken memory API must not fail a review. Both calls go
// to the same host, so the stub distinguishes them by path — otherwise the
// agent call's own failure is indistinguishable from a memory failure and the
// assertion proves nothing.
globalThis.fetch = async (url) => {
  const down = new URL(url.toString()).pathname.startsWith("/v1/memory_stores")
    ? "MEMORY-DOWN"
    : "AGENTS-DOWN";
  throw new Error(down);
};
const { advanceReview } = await import("/home/user/Decision-Vitals/api/_review-core.js");
let reached = null;
try {
  await advanceReview("sample-cafe", { outputs: {} });
} catch (e) {
  reached = String(e.message);
}
check("a review reaches the agent call despite a dead memory store",
  /AGENTS-DOWN/.test(reached ?? ""), true);
check("memory failure never surfaces to the caller",
  /MEMORY-DOWN/.test(reached ?? ""), false);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
