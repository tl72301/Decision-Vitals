// api/_memory.js
//
// Cross-decision memory, on top of the Managed Agents memory-store API.
//
// The obvious design is the one the platform advertises: attach the store to a
// session and let the agent read it off the mount at /mnt/memory/<name>/. That
// does not work here, and not for a subtle reason — every specialist in
// agents.json declares "tools": [], so there is nothing in the sandbox that can
// open a file. Granting four agents filesystem tools to fix that would buy
// exploration latency on every stage and weaken the strict-JSON contract the
// pipeline depends on.
//
// So the retrieval happens here instead. The store is the durable, versioned,
// auditable record; Decision Vitals decides what is relevant and injects it
// into the payload with provenance already attached. That inversion is what
// makes attribution exact: a finding carries the decision and assumption it
// came from because we looked it up, not because a model remembered to say so.
//
// One memory per decision, at /decisions/<decisionId>.md. Under the 100 kB
// per-memory cap by a wide margin — the largest field is a one-line summary per
// assumption.

import { ANTHROPIC_BASE, apiHeaders, requireApiKey } from "./_agents.js";
import { kvConfigured, kvGetJson, kvSetJson } from "./_kv.js";

const STORE_NAME = "decision-vitals-memory";
const STORE_KEY = "dv:memory-store";

/** Written into the store so the record explains itself to a later reader. */
const STORE_DESCRIPTION =
  "What past Decision Vitals reviews concluded, one memory per decision at " +
  "/decisions/<id>.md. Each records the decision statement, its assumptions " +
  "with the status the review landed on, and the evidence that moved them.";

const memoryPath = (decisionId) => `/decisions/${decisionId}.md`;

async function callApi(apiKey, path, init = {}) {
  const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
    ...init,
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/**
 * The store id, creating the store on first use.
 *
 * Cached in Redis rather than resolved by name every time: listing stores costs
 * a round trip on a path that already has four agent sessions ahead of it. The
 * name lookup still runs when the cache is cold, so a lost cache re-finds the
 * existing store instead of creating a duplicate.
 */
export async function resolveStoreId(apiKey = requireApiKey()) {
  if (kvConfigured()) {
    const cached = await kvGetJson(STORE_KEY);
    if (cached?.id) return cached.id;
  }

  const list = await callApi(apiKey, "/v1/memory_stores?limit=100");
  const found = (list?.data ?? []).find((s) => s?.name === STORE_NAME);
  const id =
    found?.id ??
    (
      await callApi(apiKey, "/v1/memory_stores", {
        method: "POST",
        body: JSON.stringify({ name: STORE_NAME, description: STORE_DESCRIPTION }),
      })
    ).id;

  if (kvConfigured()) await kvSetJson(STORE_KEY, { id });
  return id;
}

/** Every memory in the store, with content. */
async function listMemories(apiKey, storeId) {
  const url = `/v1/memory_stores/${storeId}/memories?view=full&path_prefix=/decisions/&limit=100`;
  const json = await callApi(apiKey, url);
  // The list returns Memory | MemoryPrefix; only the former carries content.
  return (json?.data ?? []).filter((m) => m?.type !== "memory_prefix");
}

/**
 * Render one decision's outcome as the memory body.
 *
 * Markdown rather than JSON on purpose: a memory is read by a model and by a
 * human auditing the store, and neither benefits from quoting rules. The
 * decision id is repeated in the body so a memory read on its own still
 * attributes.
 */
export function renderMemory(state, report) {
  const byId = new Map((state.assumptions ?? []).map((a) => [a.id, a]));
  const lines = [
    `# ${state.decision?.title ?? "Untitled decision"}`,
    "",
    `- id: ${state.decision?.id ?? ""}`,
    `- reviewed: ${(report?.createdAt ?? "").slice(0, 10)}`,
    `- health: ${report?.healthGrade ?? "not reviewed"}`,
    "",
    state.decision?.statement ?? "",
    "",
    "## Assumptions as last judged",
    "",
  ];

  for (const f of report?.findings ?? []) {
    const a = byId.get(f.assumptionId);
    const text = f.assumptionText || a?.text || f.assumptionId;
    const tier = f.assumptionTier || a?.tier || "lower_risk";
    const conf = f.confidence ? `, ${f.confidence} confidence` : "";
    lines.push(`- **${text}**`);
    lines.push(`  - importance: ${tier}; status: ${f.status}${conf}`);
    if (f.rationale) lines.push(`  - why: ${f.rationale}`);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Write (or update) this decision's memory.
 *
 * create-then-update rather than update-then-create: the first write of a
 * decision is the common case, and a 409 on an occupied path carries the
 * conflicting memory id, so the fallback needs no extra lookup.
 */
export async function rememberDecision(decisionId, state, report, apiKey = requireApiKey()) {
  const storeId = await resolveStoreId(apiKey);
  const content = renderMemory(state, report);
  const path = memoryPath(decisionId);

  try {
    return await callApi(apiKey, `/v1/memory_stores/${storeId}/memories`, {
      method: "POST",
      body: JSON.stringify({ path, content }),
    });
  } catch (e) {
    if (e.status !== 409) throw e;
    const conflictId = JSON.parse(e.body ?? "{}")?.error?.conflicting_memory_id;
    if (!conflictId) throw e;
    return callApi(apiKey, `/v1/memory_stores/${storeId}/memories/${conflictId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  }
}

/**
 * Prior decisions worth showing alongside this one.
 *
 * Deliberately a keyword overlap rather than an embedding: the corpus is one
 * owner's decisions, tens not thousands, and a scoring rule a person can read
 * and argue with is worth more here than a similarity number they cannot. It
 * also keeps retrieval free and instant, which matters on a path that already
 * spends four agent sessions.
 */
export async function recallRelated(decisionId, state, { limit = 3, apiKey } = {}) {
  const key = apiKey ?? requireApiKey();
  const storeId = await resolveStoreId(key);
  const memories = await listMemories(key, storeId);

  const terms = keywords(
    `${state.decision?.title ?? ""} ${state.decision?.statement ?? ""} ` +
      (state.assumptions ?? []).map((a) => a.text).join(" ")
  );

  const self = memoryPath(decisionId);
  return memories
    .filter((m) => m.path !== self)
    .map((m) => ({ memory: m, score: overlap(terms, keywords(m.content ?? "")) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.memory.path.localeCompare(b.memory.path))
    .slice(0, limit)
    .map((x) => ({
      path: x.memory.path,
      decisionId: x.memory.path.replace(/^\/decisions\//, "").replace(/\.md$/, ""),
      overlap: x.score,
      content: x.memory.content ?? "",
    }));
}

// Words that carry no signal in this corpus: every decision is about a
// decision. Kept short on purpose — an aggressive list would silently drop
// domain terms that are the whole point of the match.
const STOP = new Set(
  ("the a an and or but if then than that this these those of to in on for with " +
    "we our us it its is are was were be been being will would can could should " +
    "at by from as not no do does did have has had decision assumption review " +
    "evidence risk"
  ).split(" ")
);

function keywords(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/**
 * The block injected into an agent payload. Returns null when nothing is
 * related, so a first decision sends exactly the payload it always did.
 */
export function priorContext(related) {
  if (!related?.length) return null;
  return related.map((r) => ({
    decisionId: r.decisionId,
    note: r.content,
  }));
}
