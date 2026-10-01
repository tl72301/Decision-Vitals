// src/lib/review.js
//
// Turns the raw pipeline outputs into persisted state at the end of a review:
//   1. grade the outputs under the shared rules in ./grading.js: statuses from
//      Risk Ranking (with the strong-contradiction override), the health grade
//      derived from those statuses, receipts checked against the evidence
//   2. apply each assumption's final status and the decision's grade
//   3. build and save the Report object, numbered by the run
//
// The rules live in ./grading.js so api/_review-core.js applies exactly the
// same ones; neither path takes the Reporter's word for the grade.

import {
  assumptionsByDecision,
  evidenceByDecision,
  updateAssumption,
  updateDecision,
  createReport,
  getDecision,
} from "./store.js";
import { gradeReview } from "./grading.js";

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => ({
    type: a?.type === "hedging" ? "hedging" : "shaping",
    assumptionId: a?.assumptionId ?? null,
    text: a?.text ?? "",
  }));
}

/**
 * Apply pipeline outputs and persist a numbered Report.
 * Throws ReviewRejected, before changing anything, if Risk Ranking's output
 * cannot be graded.
 * @param {string} decisionId
 * @param {{id: string, runNumber: number}} run  the AgentRun this report belongs to
 * @param {Record<string, any>} outputs  keyed by agent slug (risk_ranking, reporter, …)
 * @returns {import("./store.js").Report}
 */
export function buildAndSaveReport(decisionId, run, outputs) {
  const rep = outputs.reporter ?? {};

  // 0. Snapshot the pre-review state so the report can show what moved, and
  // capture each assumption AS JUDGED. Reports render from this snapshot rather
  // than from the live store, so correcting an assumption later cannot
  // retroactively rewrite what an earlier report appears to have judged. That
  // decoupling is what allows assumptions to stay correctable after review.
  const judged = assumptionsByDecision(decisionId);
  const priorStatus = new Map(judged.map((a) => [a.id, a.status]));
  const asJudged = new Map(judged.map((a) => [a.id, a]));
  const previousHealthGrade = getDecision(decisionId)?.healthGrade ?? null;

  // 1. Grade first, so a rejected review leaves the store untouched.
  const graded = gradeReview({
    assumptions: judged,
    evidence: evidenceByDecision(decisionId),
    outputs,
  });

  // 2. Final statuses and the derived grade.
  for (const [id, status] of graded.statusById) {
    updateAssumption(id, { status });
  }
  const { healthGrade } = graded;
  updateDecision(decisionId, { healthGrade });

  // 3. Persist the Report, numbered by its run. Each finding carries the
  // status the assumption had before this review, so reports can show
  // Holding -> Weakened style movement, plus the assumption as judged.
  const findings = graded.findings.map((f) => {
    const a = asJudged.get(f.assumptionId);
    return {
      ...f,
      previousStatus: priorStatus.get(f.assumptionId) ?? "untested",
      assumptionText: a?.text ?? "",
      assumptionTier: a?.tier ?? "lower_risk",
      assumptionRevision: a?.revision ?? 1,
    };
  });
  return createReport({
    decisionId,
    runId: run.id,
    runNumber: run.runNumber,
    healthGrade,
    previousHealthGrade,
    reporterHealthGrade: graded.reporterHealthGrade,
    summary: rep.summary ?? "",
    findings,
    challengeHighlights: Array.isArray(rep.challengeHighlights)
      ? rep.challengeHighlights
      : [],
    actions: normalizeActions(rep.actions),
  });
}
