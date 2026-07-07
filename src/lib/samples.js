// src/lib/samples.js
//
// Loads the 3 preloaded sample decisions (PLAN.md Section 10) into the store.
// Idempotent: a sample whose id already exists in the store is skipped, so the
// button can be clicked repeatedly without duplicating anything.

import samples from "../data/samples.json";
import { getDecision, createDecision, createAssumptions, createEvidence } from "./store.js";

/** @returns {number} how many sample decisions were newly loaded */
export function loadSamples() {
  let loaded = 0;
  for (const sample of samples.decisions) {
    if (getDecision(sample.id)) continue; // already loaded

    const { assumptions = [], evidence = [], ...decision } = sample;
    createDecision(decision);
    createAssumptions(
      assumptions.map((a) => ({
        ...a,
        decisionId: decision.id,
        status: "untested",
        userEdited: false,
      }))
    );
    for (const ev of evidence) {
      createEvidence({ ...ev, decisionId: decision.id });
    }
    loaded++;
  }
  return loaded;
}
