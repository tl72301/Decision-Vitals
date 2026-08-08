// api/_risk.js
//
// Turns a decision's assumptions and its most recent review into a risk score.
//
// The Risk Ranking agent emits a status and a confidence, never numbers, and it
// is deliberately not asked for numbers: a model producing "likelihood 0.72" is
// false precision dressed as rigour, and two runs over the same evidence would
// not agree. So the arithmetic lives here instead. It is deterministic, it is
// the same on every run, and a reader can check it by hand from the two inputs
// on screen. No model call is involved in producing or recomputing a board.
//
// Both factors come from things a human already owns:
//   impact    - the assumption's importance, which the owner sets and can correct
//   fragility - how likely it is to be wrong, from the review's status
//
// Exposure is their product, so re-weighting importance is pure client-side
// arithmetic: the widget can reorder the board instantly without a round trip.

/** Importance -> impact. The owner controls this directly. */
export const IMPACT = { load_bearing: 3, vulnerable: 2, lower_risk: 1 };

/**
 * Status -> how likely the assumption is to be wrong, before confidence.
 *
 * "untested" sits at the same value as an explicit "needs review" on purpose.
 * Not having checked something is a risk, not a neutral, and scoring it as
 * benign would let a decision look safe purely for never having been reviewed.
 */
export const FRAGILITY = {
  invalidated: 4,
  weakened: 3,
  needs_review: 2,
  untested: 2,
  holding: 1,
};

/** Where an unknown reading sits, and what low confidence blends back toward. */
const UNKNOWN = FRAGILITY.untested;

/**
 * Confidence is the ranking's trust in its own status, so it scales how far we
 * move away from "we don't really know" — it does not scale the risk itself.
 * A low-confidence "invalidated" is still bad, just less certainly so; a
 * low-confidence "holding" is worse than a confident one, because the
 * reassurance is weak. Blending toward UNKNOWN gets both directions right with
 * one rule. A missing confidence is taken at face value.
 */
const TRUST = { high: 1, medium: 0.85, low: 0.7 };

/** Exposure bands. Ordered high to low; the first match wins. */
export const BANDS = [
  { key: "high", label: "High exposure", min: 7.5 },
  { key: "elevated", label: "Elevated", min: 3.5 },
  { key: "contained", label: "Contained", min: 0 },
];

const round1 = (n) => Math.round(n * 10) / 10;

/** The band an exposure value falls in. */
export function bandFor(exposure) {
  return (BANDS.find((b) => exposure >= b.min) ?? BANDS[BANDS.length - 1]).key;
}

/**
 * Score one assumption.
 * @param {{tier: string, status?: string}} assumption
 * @param {{confidence?: string}} [finding] the matching finding from the latest report
 */
export function scoreAssumption(assumption, finding) {
  const impact = IMPACT[assumption.tier] ?? 1;
  const status = assumption.status ?? "untested";
  const base = FRAGILITY[status] ?? UNKNOWN;
  const trust = TRUST[finding?.confidence] ?? 1;

  const fragility = round1(trust * base + (1 - trust) * UNKNOWN);
  const exposure = round1(impact * fragility);
  return { impact, fragility, exposure, band: bandFor(exposure) };
}

/**
 * Build the whole board for a decision's server state.
 *
 * Out-of-scope assumptions are left out rather than shown at zero: they are
 * excluded from the review itself (see activeAssumptions), so counting them
 * here would put risk on the board that no stage ever assessed. The count is
 * reported so the omission is visible rather than silent.
 *
 * @param {object} state  from readDecisionState
 * @param {string} [decisionId]  the id the caller asked for; state written by
 *   the app does not always carry one inside `decision`
 * @returns {object} the structuredContent payload for the Risk Board widget
 */
export function buildRiskBoard(state, decisionId) {
  const latest = (state.reports ?? []).at(-1) ?? null;
  const findingFor = new Map(
    (latest?.findings ?? []).map((f) => [f.assumptionId, f])
  );

  // Refs are assigned over the full list so "A3" means the same thing here as
  // in the Assumption Matrix, even when an earlier one is out of scope.
  const all = state.assumptions ?? [];
  const rows = all
    .map((a, i) => ({ a, ref: `A${i + 1}` }))
    .filter(({ a }) => !a.outOfScope)
    .map(({ a, ref }) => {
      const finding = findingFor.get(a.id);
      const score = scoreAssumption(a, finding);
      return {
        id: a.id,
        ref,
        text: a.text,
        tier: a.tier,
        status: a.status ?? "untested",
        confidence: finding?.confidence ?? null,
        rationale: finding?.rationale ?? "",
        revision: a.revision ?? 1,
        ...score,
      };
    })
    // Highest exposure first. Ties break on impact, then on ref, so the order
    // is stable across renders rather than depending on sort implementation.
    .sort(
      (x, y) =>
        y.exposure - x.exposure ||
        y.impact - x.impact ||
        x.ref.localeCompare(y.ref, undefined, { numeric: true })
    );

  const total = round1(rows.reduce((sum, r) => sum + r.exposure, 0));

  return {
    decisionId: decisionId ?? state.decision?.id ?? null,
    decisionTitle: state.decision?.title ?? "",
    reviewed: !!latest,
    runNumber: latest?.runNumber ?? null,
    reviewedAt: latest?.createdAt ?? null,
    healthGrade: latest?.healthGrade ?? null,
    excludedCount: all.length - rows.length,
    totalExposure: total,
    // Share of exposure carried by the single worst assumption. This is the
    // number the board exists to surface: a decision can look broadly fine and
    // still have most of its risk resting on one thing.
    topShare: total > 0 ? Math.round((rows[0].exposure / total) * 100) : 0,
    rows,
    // The scale travels with the payload so the widget recomputes with the
    // server's constants instead of a second copy that can drift.
    scale: { impact: IMPACT, bands: BANDS, maxExposure: 12 },
  };
}
