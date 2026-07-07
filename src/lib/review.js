// src/lib/review.js
//
// Turns the raw pipeline outputs into persisted state at the end of a review:
//   1. apply each assumption's status from Risk Ranking (the authoritative step)
//   2. set the decision's health grade (Reporter's, validated; else derived)
//   3. build and save the Report object, numbered by the run
//
// The health-grade derivation mirrors PLAN.md Sections 5 & 6 so the app enforces
// the same rule even if a model returns an off-schema grade.

import {
  assumptionsByDecision,
  updateAssumption,
  updateDecision,
  createReport,
} from "./store.js";

const VALID_STATUS = new Set(["holding", "weakened", "invalidated", "needs_review"]);
const VALID_GRADE = new Set(["healthy", "watch", "at_risk"]);

/** Derive the grade from current assumption statuses (PLAN.md rules). */
export function deriveHealthGrade(decisionId) {
  const assumptions = assumptionsByDecision(decisionId);
  const isLoadBearing = (a) => a.tier === "load_bearing";

  if (assumptions.some((a) => isLoadBearing(a) && a.status === "invalidated")) {
    return "at_risk";
  }
  if (
    assumptions.some(
      (a) => isLoadBearing(a) && (a.status === "weakened" || a.status === "needs_review")
    ) ||
    assumptions.some((a) => a.status === "invalidated")
  ) {
    return "watch";
  }
  return "healthy";
}

function normalizeFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map((f) => ({
    assumptionId: f?.assumptionId ?? null,
    status: f?.status ?? "needs_review",
    rationale: f?.rationale ?? "",
    receipts: Array.isArray(f?.receipts)
      ? f.receipts.map((r) => ({
          evidenceId: r?.evidenceId ?? null,
          quote: r?.quote ?? "",
        }))
      : [],
  }));
}

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
 * @param {string} decisionId
 * @param {{id: string, runNumber: number}} run  the AgentRun this report belongs to
 * @param {Record<string, any>} outputs  keyed by agent slug (risk_ranking, reporter, …)
 * @returns {import("./store.js").Report}
 */
export function buildAndSaveReport(decisionId, run, outputs) {
  const rr = outputs.risk_ranking ?? {};
  const rep = outputs.reporter ?? {};

  // 1. Statuses from Risk Ranking; fall back to Reporter findings if absent.
  const rankings = Array.isArray(rr.rankings) ? rr.rankings : [];
  if (rankings.length > 0) {
    for (const r of rankings) {
      if (r?.assumptionId && VALID_STATUS.has(r.status)) {
        updateAssumption(r.assumptionId, { status: r.status });
      }
    }
  } else if (Array.isArray(rep.findings)) {
    for (const f of rep.findings) {
      if (f?.assumptionId && VALID_STATUS.has(f.status)) {
        updateAssumption(f.assumptionId, { status: f.status });
      }
    }
  }

  // 2. Health grade: trust the Reporter's if valid, otherwise derive it.
  const healthGrade = VALID_GRADE.has(rep.healthGrade)
    ? rep.healthGrade
    : deriveHealthGrade(decisionId);
  updateDecision(decisionId, { healthGrade });

  // 3. Persist the Report, numbered by its run.
  return createReport({
    decisionId,
    runId: run.id,
    runNumber: run.runNumber,
    healthGrade,
    summary: rep.summary ?? "",
    findings: normalizeFindings(rep.findings),
    challengeHighlights: Array.isArray(rep.challengeHighlights)
      ? rep.challengeHighlights
      : [],
    actions: normalizeActions(rep.actions),
  });
}
