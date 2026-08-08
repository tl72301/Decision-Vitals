// api/_state.js
//
// Server-owned state for one decision: the assumptions and evidence a review
// needs, plus the reports it produces.
//
// This is deliberately NOT dv:index. That key is a snapshot written by a
// browser tab every 20 seconds in Live Mode, so anything reading it inherits a
// dependency on a tab having been open recently. A widget rendering inside a
// Claude conversation has no tab behind it, so it reads and writes here
// instead, under a per-decision key the server owns end to end.
//
// Demo decisions never touch Redis. They are served from the same static JSON
// the browser uses, so the demo path needs no store, no credits and no tab.

import { createRequire } from "node:module";
import { kvConfigured, kvGetJson, kvSetJson } from "./_kv.js";

// createRequire rather than an import attribute: works on every Node version
// Vercel might run, and keeps the JSON traceable for the function bundler.
const require = createRequire(import.meta.url);
const samples = require("../src/data/samples.json");

export const stateKey = (decisionId) => `dv:decision:${decisionId}`;

/** Demo decisions are the ones shipped in samples.json. */
export function isSampleDecision(decisionId) {
  return samples.decisions.some((d) => d.id === decisionId);
}

/** Build server state for a sample decision straight from the static file. */
function stateFromSample(decisionId) {
  const s = samples.decisions.find((d) => d.id === decisionId);
  if (!s) return null;
  const { assumptions = [], evidence = [], ...decision } = s;
  return {
    decision: {
      id: decision.id,
      title: decision.title,
      statement: decision.statement,
      context: decision.context ?? "",
    },
    assumptions: assumptions.map((a) => ({
      id: a.id,
      text: a.text,
      tier: a.tier,
      signpost: a.signpost ?? "",
      loadBearing: a.tier === "load_bearing",
      vulnerable: a.tier === "vulnerable",
      status: "untested",
      revision: 1,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      text: e.text,
      sourceType: e.sourceType,
      date: e.date,
    })),
    reports: [],
    source: "sample",
  };
}

/**
 * Read a decision's server state.
 * Redis first (a sample that has been corrected lives there), then the static
 * sample, then null.
 * @returns {Promise<object|null>}
 */
export async function readDecisionState(decisionId) {
  if (kvConfigured()) {
    const stored = await kvGetJson(stateKey(decisionId));
    if (stored) return stored;
  }
  return stateFromSample(decisionId);
}

/** Persist a decision's server state. Requires Redis. */
export async function writeDecisionState(decisionId, state) {
  if (!kvConfigured()) {
    throw new Error(
      "No store configured. Add the Upstash for Redis integration in Vercel."
    );
  }
  const next = { ...state, updatedAt: new Date().toISOString() };
  await kvSetJson(stateKey(decisionId), next);
  return next;
}

/**
 * Apply a human correction to one assumption, bumping its revision.
 * Mirrors correctAssumption() in src/lib/store.js so both paths agree.
 * @returns {{state: object, before: object, after: object}}
 */
export function applyCorrection(state, assumptionId, patch) {
  const idx = state.assumptions.findIndex((a) => a.id === assumptionId);
  if (idx === -1) throw new Error(`No assumption "${assumptionId}".`);

  const before = state.assumptions[idx];
  const tier = patch.tier ?? before.tier;
  const after = {
    ...before,
    ...(patch.text != null ? { text: String(patch.text) } : {}),
    ...(patch.signpost != null ? { signpost: String(patch.signpost) } : {}),
    tier,
    loadBearing: tier === "load_bearing",
    vulnerable: tier === "vulnerable",
    ...(patch.outOfScope != null ? { outOfScope: !!patch.outOfScope } : {}),
    revision: (before.revision ?? 1) + 1,
    correctedAt: new Date().toISOString(),
    userEdited: true,
  };

  const assumptions = state.assumptions.slice();
  assumptions[idx] = after;
  return { state: { ...state, assumptions }, before, after };
}

/** Assumptions a review should consider: everything not marked out of scope. */
export function activeAssumptions(state) {
  return state.assumptions.filter((a) => !a.outOfScope);
}
