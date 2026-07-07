import { Link, useParams } from "react-router-dom";
import {
  getDecision,
  assumptionsByDecision,
  evidenceByDecision,
  reportsByDecision,
  updateAssumption,
  deleteAssumption,
} from "../lib/store.js";
import { useStoreSync } from "../lib/useStore.js";
import { formatDate } from "../lib/labels.js";
import HealthBadge from "../components/HealthBadge.jsx";
import AssumptionCard from "../components/AssumptionCard.jsx";
import EvidencePanel from "../components/EvidencePanel.jsx";

function NotFound() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
      <p className="text-stone-600">That decision doesn't exist.</p>
      <Link to="/" className="mt-3 inline-block text-sm font-medium text-stone-900 underline">
        Back to dashboard
      </Link>
    </div>
  );
}

export default function DecisionDetail() {
  useStoreSync();
  const { id } = useParams();
  const decision = getDecision(id);

  if (!decision) return <NotFound />;

  const assumptions = assumptionsByDecision(id);
  const evidence = evidenceByDecision(id);
  const reports = reportsByDecision(id);
  const locked = reports.length > 0; // assumptions/evidence freeze after review #1
  const canReview = assumptions.length > 0 && evidence.length > 0;

  return (
    <div>
      <Link to="/" className="text-sm text-stone-500 hover:text-stone-700">
        ← All decisions
      </Link>

      {/* Header */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {decision.title || decision.statement}
            </h1>
            {decision.title && decision.statement && (
              <p className="mt-1 text-sm text-stone-600">{decision.statement}</p>
            )}
          </div>
          <HealthBadge grade={decision.healthGrade} className="shrink-0" />
        </div>
        {decision.context && (
          <p className="mt-3 text-sm text-stone-500">
            <span className="font-medium text-stone-600">Context:</span>{" "}
            {decision.context}
          </p>
        )}
        <div className="mt-3 text-xs text-stone-400">
          {formatDate(decision.createdAt)}
          {decision.owner ? ` · ${decision.owner}` : ""}
        </div>

        {reports.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            <span className="text-xs font-medium text-stone-500">Reviews:</span>
            {reports.map((r) => (
              <Link
                key={r.id}
                to={`/decision/${id}/report/${r.runId}`}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-200"
              >
                Review #{r.runNumber}
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-stone-500">
        <span className="font-medium text-stone-600">Assumptions</span> are what
        this decision depends on;{" "}
        <span className="font-medium text-stone-600">evidence</span> is what
        you've learned since. Add at least one piece of evidence, then run a
        review to grade each assumption against it.
      </p>

      {/* Two-column: assumptions + evidence */}
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Assumptions</h2>
            <span className="text-xs text-stone-400">
              {assumptions.length} total
            </span>
          </div>
          {locked && (
            <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-inset ring-stone-200">
              Assumptions are locked after the first review.
            </p>
          )}
          <div className="space-y-3">
            {assumptions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-400">
                No assumptions on this decision.
              </p>
            ) : (
              assumptions.map((a) => (
                <AssumptionCard
                  key={a.id}
                  assumption={a}
                  locked={locked}
                  onSave={updateAssumption}
                  onDelete={deleteAssumption}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Evidence</h2>
            <span className="text-xs text-stone-400">{evidence.length} total</span>
          </div>
          <EvidencePanel decisionId={id} locked={locked} />
        </section>
      </div>

      {/* Run review */}
      <div className="mt-8 flex flex-col items-start gap-2 border-t border-stone-200 pt-6">
        {canReview ? (
          <Link
            to={`/decision/${id}/run`}
            className="inline-flex items-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            Run review{reports.length > 0 ? ` #${reports.length + 1}` : ""}
          </Link>
        ) : (
          <>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center rounded-lg bg-stone-300 px-5 py-2.5 text-sm font-medium text-white"
            >
              Run review
            </button>
            <p className="text-xs text-stone-500">
              {assumptions.length === 0
                ? "This decision has no assumptions to review."
                : "Add at least one evidence snippet to run a review."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
