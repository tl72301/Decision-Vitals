// src/lib/grading.js
//
// The rules a review is held to, applied in code after the models have spoken.
// Shared by the browser pipeline (src/lib/review.js) and the server pipeline
// (api/_review-core.js), so the same stage outputs produce the same verdict
// whichever path ran them.
//
// Model output is input here, not authority:
//   1. Risk Ranking must give every in-scope assumption one valid status. If it
//      does not, the review is rejected rather than graded on a stale status.
//   2. A critical (load_bearing) assumption with any strong contradicting
//      evidence mapping cannot be "holding". It is moved to needs_review and the
//      override is recorded on the report, so the change is visible.
//   3. The health grade is derived from the final statuses. The Reporter's grade
//      is kept only as a record of where it disagreed; it is never used.
//   4. A receipt must cite evidence on this decision and quote it verbatim. One
//      that does not is dropped and counted, never shown as a quote.
//
// Pure functions only: no store, no fetch. Both runtimes import this file.

export const VALID_STATUS = new Set(["holding", "weakened", "invalidated", "needs_review"]);
export const VALID_GRADE = new Set(["healthy", "watch", "at_risk"]);
export const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

/** Thrown when model output is too incomplete or inconsistent to grade. */
export class ReviewRejected extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewRejected";
  }
}

const isCritical = (a) => a.tier === "load_bearing";
const inScope = (assumptions) => assumptions.filter((a) => !a.outOfScope);
const norm = (s) => String(s ?? "").trim().toLowerCase();

/** PLAN.md Sections 5 and 6, over assumptions carrying tier and status. */
export function deriveHealthGrade(assumptions) {
  if (assumptions.some((a) => isCritical(a) && a.status === "invalidated")) {
    return "at_risk";
  }
  if (
    assumptions.some(
      (a) => isCritical(a) && (a.status === "weakened" || a.status === "needs_review")
    ) ||
    assumptions.some((a) => a.status === "invalidated")
  ) {
    return "watch";
  }
  return "healthy";
}

/**
 * Rule 1. Every in-scope assumption gets exactly one valid status from Risk
 * Ranking. Rankings for ids that are not in scope are ignored: they cannot
 * affect anything. Throws ReviewRejected naming what was wrong.
 *
 * Called right after Risk Ranking runs, so an unusable ranking stops the
 * review before the Reporter is paid for, and again when the report is built.
 *
 * @returns {Map<string, {status: string, confidence: string|null, rationale: string}>}
 */
export function checkRankings(assumptions, riskRanking) {
  const scoped = inScope(assumptions);
  const ids = new Set(scoped.map((a) => a.id));
  const rankings = Array.isArray(riskRanking?.rankings) ? riskRanking.rankings : [];

  const byId = new Map();
  const problems = [];
  for (const r of rankings) {
    if (!ids.has(r?.assumptionId)) continue;
    const status = norm(r.status);
    if (!VALID_STATUS.has(status)) {
      problems.push(`${r.assumptionId} has status "${r?.status}"`);
      continue;
    }
    const seen = byId.get(r.assumptionId);
    if (seen && seen.status !== status) {
      problems.push(`${r.assumptionId} is ranked both ${seen.status} and ${status}`);
      continue;
    }
    if (!seen) {
      const confidence = norm(r.confidence);
      byId.set(r.assumptionId, {
        status,
        confidence: VALID_CONFIDENCE.has(confidence) ? confidence : null,
        rationale: typeof r.rationale === "string" ? r.rationale : "",
      });
    }
  }
  const missing = scoped.filter((a) => !byId.has(a.id)).map((a) => a.id);
  if (missing.length) problems.push(`no ranking for ${missing.join(", ")}`);

  if (problems.length) {
    throw new ReviewRejected(
      `Risk Ranking returned an unusable assessment (${problems.join("; ")}). Nothing was saved; run the review again.`
    );
  }
  return byId;
}

/**
 * Rule 2's trigger: critical in-scope assumptions with at least one strong
 * contradicting mapping that cites evidence actually on this decision. A
 * mapping to an evidence id that does not exist cannot force a downgrade.
 * @returns {Map<string, string[]>} assumptionId -> evidence ids
 */
export function strongContradictions(assumptions, evidence, mappings) {
  const critical = new Set(inScope(assumptions).filter(isCritical).map((a) => a.id));
  const evidenceIds = new Set((evidence ?? []).map((e) => e.id));
  const out = new Map();
  for (const m of Array.isArray(mappings) ? mappings : []) {
    if (!critical.has(m?.assumptionId) || !evidenceIds.has(m?.evidenceId)) continue;
    if (norm(m.direction) !== "contradicts" || norm(m.strength) !== "strong") continue;
    const list = out.get(m.assumptionId) ?? [];
    if (!list.includes(m.evidenceId)) list.push(m.evidenceId);
    out.set(m.assumptionId, list);
  }
  return out;
}

// Quotes are compared after folding the differences a model introduces
// without changing the words: case, curly quotes, dash styles, whitespace.
function fold(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether `quote` appears in `text`. An ellipsis marks an elision, so each
 * fragment must appear, in order. Surrounding quote marks are ignored.
 */
export function quoteAppearsIn(quote, text) {
  const body = fold(text);
  const fragments = fold(quote)
    .replace(/^["']+|["']+$/g, "")
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((f) => f.trim())
    .filter(Boolean);
  if (fragments.length === 0) return false;
  let from = 0;
  for (const f of fragments) {
    const at = body.indexOf(f, from);
    if (at === -1) return false;
    from = at + f.length;
  }
  return true;
}

/** Rule 4. @returns {{kept: {evidenceId, quote}[], dropped: number}} */
export function verifyReceipts(receipts, evidenceById) {
  const kept = [];
  let dropped = 0;
  for (const r of Array.isArray(receipts) ? receipts : []) {
    const text = evidenceById.get(r?.evidenceId)?.text;
    if (text != null && typeof r.quote === "string" && quoteAppearsIn(r.quote, text)) {
      kept.push({ evidenceId: r.evidenceId, quote: r.quote });
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

/**
 * Apply all four rules to a finished review's outputs.
 *
 * @param {{assumptions: object[], evidence: object[], outputs: Record<string, any>}} input
 *   assumptions carry id, tier, status and optionally outOfScope.
 * @returns {{
 *   statusById: Map<string, string>,
 *   healthGrade: string,
 *   reporterHealthGrade: string|null,
 *   overrides: {assumptionId: string, from: string, to: string, rule: string, evidenceIds: string[]}[],
 *   findings: object[],
 * }}
 */
export function gradeReview({ assumptions, evidence, outputs }) {
  const ranked = checkRankings(assumptions, outputs?.risk_ranking);
  const contradicted = strongContradictions(
    assumptions,
    evidence,
    outputs?.evidence_review?.mappings
  );

  const statusById = new Map();
  const overrides = [];
  for (const [id, r] of ranked) {
    let status = r.status;
    if (status === "holding" && contradicted.has(id)) {
      status = "needs_review";
      overrides.push({
        assumptionId: id,
        from: "holding",
        to: status,
        rule: "strong_contradiction",
        evidenceIds: contradicted.get(id),
      });
    }
    statusById.set(id, status);
  }

  const graded = assumptions
    .filter((a) => !a.outOfScope)
    .map((a) => ({ ...a, status: statusById.get(a.id) ?? a.status }));
  const healthGrade = deriveHealthGrade(graded);

  const rep = outputs?.reporter ?? {};
  const said = norm(rep.healthGrade);
  const reporterHealthGrade = VALID_GRADE.has(said) && said !== healthGrade ? said : null;

  // Findings: the Reporter's prose and receipts, under the authoritative status.
  // An in-scope assumption the Reporter skipped still gets a finding, from Risk
  // Ranking's rationale, so the report covers everything the grade covers.
  const evidenceById = new Map((evidence ?? []).map((e) => [e.id, e]));
  const overrideById = new Map(overrides.map((o) => [o.assumptionId, o]));
  const findings = [];
  const covered = new Set();
  const finding = (id, rationale, receipts) => {
    const { kept, dropped } = verifyReceipts(receipts, evidenceById);
    const f = {
      assumptionId: id,
      status: statusById.get(id),
      confidence: ranked.get(id).confidence,
      rationale,
      receipts: kept,
    };
    if (dropped) f.droppedReceipts = dropped;
    if (overrideById.has(id)) f.override = overrideById.get(id);
    return f;
  };
  for (const f of Array.isArray(rep.findings) ? rep.findings : []) {
    const id = f?.assumptionId;
    if (!statusById.has(id) || covered.has(id)) continue;
    covered.add(id);
    findings.push(finding(id, typeof f.rationale === "string" ? f.rationale : "", f.receipts));
  }
  for (const a of graded) {
    if (covered.has(a.id)) continue;
    findings.push(finding(a.id, ranked.get(a.id).rationale, []));
  }

  return { statusById, healthGrade, reporterHealthGrade, overrides, findings };
}
