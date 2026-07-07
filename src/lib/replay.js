// src/lib/replay.js
//
// Demo Mode replay engine. Replays recorded real agent outputs (captured from
// live runs) with staged 800–1500ms delays so the pipeline feels real, while
// making zero API calls. Recorded, not faked — and labeled in the UI.

import recorded from "../data/recordedRuns.json";

const stagedDelay = () =>
  new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

/** Whether a recorded run exists for this decision. */
export function hasRecording(decisionId) {
  const rec = recorded[decisionId];
  return !!rec && typeof rec === "object";
}

/**
 * Replay one recorded agent output for a decision.
 * @returns {Promise<object>} a fresh copy of the recorded output
 */
export async function replayAgent(agent, decisionId) {
  await stagedDelay();
  const output = decisionId && recorded[decisionId]?.[agent];
  if (!output) {
    throw new Error(
      "No recorded run exists for this decision in Demo Mode. Demo Mode replays recorded agent runs on the sample decisions — switch to Live Mode (header toggle) to run real agents."
    );
  }
  return JSON.parse(JSON.stringify(output)); // never hand out the module object
}
