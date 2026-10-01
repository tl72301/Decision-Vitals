// api/_review-core.js
//
// Runs review stages 3 to 6 against a decision's server-owned state and
// persists the report. Shared by the HTTP route (api/review.js) and the MCP
// correct_assumptions tool, so a correction made from a widget and a review
// started from the app go through exactly the same code.

import {
  requireApiKey,
  resolveAgentIds,
  resolveEnvironmentId,
} from "./_agents.js";
import { runOneAgent } from "./_run-agent.js";
import {
  readDecisionState,
  writeDecisionState,
  activeAssumptions,
} from "./_state.js";
import {
  checkRankings,
  deriveHealthGrade,
  gradeReview,
} from "../src/lib/grading.js";

const DEADLINE_MS = 290_000;

// The grading rules are shared with the browser pipeline (src/lib/review.js)
// so a review graded here and one graded in the app reach the same verdict.
export { deriveHealthGrade };

/** Stage payloads, identical in shape to src/pages/AgentRun.jsx. */
function payloadFor(agent, ctx) {
  const { decision, assumptions, evidence, out, prior } = ctx;
  const mappings = out.evidence_review?.mappings ?? [];
  const challenges = out.challenge?.challenges ?? [];
  const rankings = out.risk_ranking?.rankings ?? [];
  // Prior decisions go to the two stages that can act on them: Evidence Review
  // weighs what happened last time as context, Challenge argues from it. Risk
  // Ranking and Reporter work from this decision's own outputs, so adding
  // history there would only dilute the input. The key is absent, not empty,
  // when there is nothing related — an empty array reads as "we looked and
  // there is no history", which is a different claim.
  switch (agent) {
    case "evidence_review":
      return prior ? { decision, assumptions, evidence, priorDecisions: prior } : { decision, assumptions, evidence };
    case "challenge":
      return prior ? { decision, assumptions, mappings, priorDecisions: prior } : { decision, assumptions, mappings };
    case "risk_ranking":
      return { assumptions, mappings, challenges };
    case "reporter":
      return { decision, assumptions, evidence, mappings, challenges, rankings };
    default:
      return {};
  }
}

export const STAGES = ["evidence_review", "challenge", "risk_ranking", "reporter"];

/** Human labels for progress messages. */
export const STAGE_LABEL = {
  evidence_review: "Matching evidence to assumptions",
  challenge: "Making the case against each assumption",
  risk_ranking: "Assessing where each assumption stands",
  reporter: "Writing the health report",
};

/**
 * Run exactly ONE outstanding stage and return the updated progress.
 *
 * Split out from runReviewForDecision so a review can advance across separate
 * serverless invocations: each poll does one stage's work, which fits inside a
 * function timeout, and every intermediate output is persisted by the caller.
 *
 * @param {string} decisionId
 * @param {{outputs: Record<string, object>}} progress  outputs collected so far
 * @returns {Promise<{done: boolean, stage: string|null, outputs: object, report: object|null}>}
 */
export async function advanceReview(decisionId, progress) {
  const outputs = progress?.outputs ?? {};
  const next = STAGES.find((s) => !(s in outputs));

  // Every stage has run: assemble and persist the report.
  if (!next) {
    const report = await finishReview(decisionId, outputs);
    return { done: true, stage: null, outputs, report };
  }

  const apiKey = requireApiKey();
  const state = await readDecisionState(decisionId);
  if (!state) throw new Error(`No decision "${decisionId}".`);

  const ctx = buildContext(state);
  ctx.out = outputs;
  ctx.prior = await recallPrior(decisionId, state, next);

  const [agentIds, environmentId] = await Promise.all([
    resolveAgentIds(apiKey),
    resolveEnvironmentId(apiKey),
  ]);
  const agentId = agentIds[next];
  if (!agentId) {
    throw new Error(`Agent "${next}" is not registered. Call /api/setup first.`);
  }

  const { output } = await runOneAgent({
    apiKey,
    agentSlug: next,
    agentId,
    environmentId,
    payload: payloadFor(next, ctx),
    deadline: Date.now() + 50_000,
  });
  // Reject an ungradeable ranking now rather than pay for the Reporter first.
  if (next === "risk_ranking") checkRankings(ctx.assumptions, output);

  return { done: false, stage: next, outputs: { ...outputs, [next]: output }, report: null };
}

/**
 * Prior decisions to hand this stage, or null.
 *
 * Memory is an enhancement, never a dependency: a store that is missing,
 * unreachable, or slow must not fail a review the user is paying for. Any
 * error here degrades to "no history" rather than propagating, which is also
 * what makes the feature safe to ship before it has ever been exercised live.
 */
async function recallPrior(decisionId, state, stage) {
  if (stage !== "evidence_review" && stage !== "challenge") return null;
  try {
    const { recallRelated, priorContext } = await import("./_memory.js");
    return priorContext(await recallRelated(decisionId, state));
  } catch {
    return null;
  }
}

/** Shared context builder for both the one-shot and incremental paths. */
function buildContext(state) {
  const assumptions = activeAssumptions(state).map((a) => ({
    id: a.id,
    text: a.text,
    tier: a.tier,
    signpost: a.signpost,
    loadBearing: a.tier === "load_bearing",
    vulnerable: a.tier === "vulnerable",
  }));
  if (assumptions.length === 0) {
    throw new Error("No assumptions in scope to review.");
  }
  return {
    decision: {
      title: state.decision.title,
      statement: state.decision.statement,
      context: state.decision.context ?? "",
    },
    assumptions,
    evidence: state.evidence ?? [],
    out: {},
  };
}

/**
 * Run the full review for one decision and persist the resulting report.
 * @param {string} decisionId
 * @returns {Promise<object>} the persisted report
 */
export async function runReviewForDecision(decisionId) {
  const apiKey = requireApiKey();

  const state = await readDecisionState(decisionId);
  if (!state) throw new Error(`No decision "${decisionId}".`);

  const assumptions = activeAssumptions(state).map((a) => ({
    id: a.id,
    text: a.text,
    tier: a.tier,
    signpost: a.signpost,
    loadBearing: a.tier === "load_bearing",
    vulnerable: a.tier === "vulnerable",
  }));
  if (assumptions.length === 0) {
    throw new Error("No assumptions in scope to review.");
  }

  const ctx = {
    decision: {
      title: state.decision.title,
      statement: state.decision.statement,
      context: state.decision.context ?? "",
    },
    assumptions,
    evidence: state.evidence ?? [],
    out: {},
  };

  const deadline = Date.now() + DEADLINE_MS;
  const stageLog = [];

  const [agentIds, environmentId] = await Promise.all([
    resolveAgentIds(apiKey),
    resolveEnvironmentId(apiKey),
  ]);

  for (const agentSlug of STAGES) {
    const agentId = agentIds[agentSlug];
    if (!agentId) {
      throw new Error(`Agent "${agentSlug}" is not registered. Call /api/setup first.`);
    }
    const t0 = Date.now();
    const { output, sessionId } = await runOneAgent({
      apiKey,
      agentSlug,
      agentId,
      environmentId,
      payload: payloadFor(agentSlug, ctx),
      deadline,
    });
    if (agentSlug === "risk_ranking") checkRankings(ctx.assumptions, output);
    ctx.out[agentSlug] = output;
    stageLog.push({ agent: agentSlug, sessionId, durationMs: Date.now() - t0 });
  }

  return finishReview(decisionId, ctx.out, stageLog);
}

/**
 * Turn collected stage outputs into a persisted report. Shared by the one-shot
 * route and the incremental task path so both produce identical reports.
 */
export async function finishReview(decisionId, outputs, stageLog = []) {
  const state = await readDecisionState(decisionId);
  if (!state) throw new Error(`No decision "${decisionId}".`);

  // Grade under the shared rules before writing anything, so a rejected review
  // leaves the stored decision exactly as it was.
  const rep = outputs.reporter ?? {};
  const graded = gradeReview({
    assumptions: state.assumptions,
    evidence: state.evidence ?? [],
    outputs,
  });
  const { healthGrade } = graded;

  const priorStatus = new Map(state.assumptions.map((a) => [a.id, a.status]));
  const nextAssumptions = state.assumptions.map((a) =>
    graded.statusById.has(a.id) ? { ...a, status: graded.statusById.get(a.id) } : a
  );

  // Findings carry the assumption as judged, so a later correction cannot
  // rewrite what this report concluded. Same contract as src/lib/review.js.
  const judged = new Map(state.assumptions.map((a) => [a.id, a]));
  const findings = graded.findings.map((f) => {
    const a = judged.get(f.assumptionId);
    return {
      ...f,
      previousStatus: priorStatus.get(f.assumptionId) ?? "untested",
      assumptionText: a?.text ?? "",
      assumptionTier: a?.tier ?? "lower_risk",
      assumptionRevision: a?.revision ?? 1,
    };
  });

  const prior = state.reports ?? [];
  const report = {
    id: `rep-${Date.now().toString(36)}`,
    decisionId,
    runNumber: prior.length + 1,
    createdAt: new Date().toISOString(),
    healthGrade,
    previousHealthGrade: prior.length ? prior[prior.length - 1].healthGrade : null,
    reporterHealthGrade: graded.reporterHealthGrade,
    summary: rep.summary ?? "",
    findings,
    challengeHighlights: Array.isArray(rep.challengeHighlights)
      ? rep.challengeHighlights
      : [],
    actions: Array.isArray(rep.actions) ? rep.actions : [],
    stages: stageLog,
  };

  const next = await writeDecisionState(decisionId, {
    ...state,
    assumptions: nextAssumptions,
    reports: [...prior, report],
  });

  // Record what this review concluded, so the next related decision can be
  // told about it. After the state write, and swallowing its own errors: the
  // report is the thing the user paid for, and a memory-store failure must not
  // turn a completed review into a failed one.
  try {
    const { rememberDecision } = await import("./_memory.js");
    await rememberDecision(decisionId, next ?? { ...state, assumptions: nextAssumptions }, report);
  } catch {
    /* memory is an enhancement; the review stands without it */
  }

  return report;
}
