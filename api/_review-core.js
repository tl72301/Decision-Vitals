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

const DEADLINE_MS = 290_000;

const VALID_STATUS = new Set(["holding", "weakened", "invalidated", "needs_review"]);
const VALID_GRADE = new Set(["healthy", "watch", "at_risk"]);

/**
 * Derive the grade from assumption statuses. Mirrors deriveHealthGrade() in
 * src/lib/review.js: a critical assumption that is invalidated puts the whole
 * decision at risk, and that rule is enforced here rather than trusted to the
 * model.
 */
export function deriveHealthGrade(assumptions) {
  const critical = (a) => a.tier === "load_bearing";
  if (assumptions.some((a) => critical(a) && a.status === "invalidated")) {
    return "at_risk";
  }
  if (
    assumptions.some(
      (a) => critical(a) && (a.status === "weakened" || a.status === "needs_review")
    ) ||
    assumptions.some((a) => a.status === "invalidated")
  ) {
    return "watch";
  }
  return "healthy";
}

/** Stage payloads, identical in shape to src/pages/AgentRun.jsx. */
function payloadFor(agent, ctx) {
  const { decision, assumptions, evidence, out } = ctx;
  const mappings = out.evidence_review?.mappings ?? [];
  const challenges = out.challenge?.challenges ?? [];
  const rankings = out.risk_ranking?.rankings ?? [];
  switch (agent) {
    case "evidence_review":
      return { decision, assumptions, evidence };
    case "challenge":
      return { decision, assumptions, mappings };
    case "risk_ranking":
      return { assumptions, mappings, challenges };
    case "reporter":
      return { decision, assumptions, evidence, mappings, challenges, rankings };
    default:
      return {};
  }
}

const STAGES = ["evidence_review", "challenge", "risk_ranking", "reporter"];

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
    ctx.out[agentSlug] = output;
    stageLog.push({ agent: agentSlug, sessionId, durationMs: Date.now() - t0 });
  }

  // Apply statuses, then derive the grade under the same rules the app uses.
  const rep = ctx.out.reporter ?? {};
  const rankings = ctx.out.risk_ranking?.rankings ?? [];
  const statusById = new Map(
    rankings
      .filter((r) => r?.assumptionId && VALID_STATUS.has(r.status))
      .map((r) => [r.assumptionId, r.status])
  );

  const priorStatus = new Map(state.assumptions.map((a) => [a.id, a.status]));
  const nextAssumptions = state.assumptions.map((a) =>
    statusById.has(a.id) ? { ...a, status: statusById.get(a.id) } : a
  );

  const healthGrade = VALID_GRADE.has(rep.healthGrade)
    ? rep.healthGrade
    : deriveHealthGrade(nextAssumptions.filter((a) => !a.outOfScope));

  // Findings carry the assumption as judged, so a later correction cannot
  // rewrite what this report concluded. Same contract as src/lib/review.js.
  const judged = new Map(state.assumptions.map((a) => [a.id, a]));
  const findings = (Array.isArray(rep.findings) ? rep.findings : []).map((f) => {
    const a = judged.get(f?.assumptionId);
    return {
      assumptionId: f?.assumptionId ?? null,
      status: f?.status ?? "needs_review",
      rationale: f?.rationale ?? "",
      receipts: Array.isArray(f?.receipts) ? f.receipts : [],
      previousStatus: priorStatus.get(f?.assumptionId) ?? "untested",
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
    summary: rep.summary ?? "",
    findings,
    challengeHighlights: Array.isArray(rep.challengeHighlights)
      ? rep.challengeHighlights
      : [],
    actions: Array.isArray(rep.actions) ? rep.actions : [],
    stages: stageLog,
  };

  await writeDecisionState(decisionId, {
    ...state,
    assumptions: nextAssumptions,
    reports: [...prior, report],
  });

  return report;
}
