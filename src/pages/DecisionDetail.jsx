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
import { btnPrimary } from "../lib/ui.js";
import HealthBadge from "../components/HealthBadge.jsx";
import AssumptionCard from "../components/AssumptionCard.jsx";
import EvidencePanel from "../components/EvidencePanel.jsx";

function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-fg-2">
        That decision doesn't exist. It may have been deleted, or the link may
        be from another browser's data.
      </p>
      <Link
        to="/"
        className="mt-3 inline-block text-sm font-medium text-brass underline decoration-brass/50 underline-offset-2 hover:text-brass-2"
      >
        Back to decisions
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
      <Link
        to="/"
        className="text-sm text-fg-2 transition-colors hover:text-fg-1"
      >
        ← Decisions
      </Link>

      {/* Decision header: the user-authored object, marked with the brass rule */}
      <header className="mt-3 rounded-md border border-line border-t-2 border-t-brass bg-ink-800 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-snug text-fg-1">
              {decision.title || decision.statement}
            </h1>
            {decision.title && decision.statement && (
              <p className="mt-1 text-sm leading-relaxed text-fg-2">
                {decision.statement}
              </p>
            )}
          </div>
          <HealthBadge grade={decision.healthGrade} className="shrink-0" />
        </div>
        {decision.context && (
          <p className="mt-3 text-sm leading-relaxed text-fg-2">
            <span className="font-medium text-fg-1">Context:</span>{" "}
            {decision.context}
          </p>
        )}
        <p className="mt-3 font-mono text-xs text-fg-3">
          Recorded {formatDate(decision.createdAt)}
          {decision.owner ? ` · ${decision.owner}` : ""}
        </p>

        {reports.length > 0 && (
          <nav
            aria-label="Reviews of this decision"
            className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          >
            <span className="text-xs font-medium text-fg-2">Reviews:</span>
            {reports.map((r) => (
              <Link
                key={r.id}
                to={`/decision/${id}/report/${r.runId}`}
                className="rounded-[3px] border border-line px-2 py-0.5 font-mono text-xs text-fg-2 transition-colors hover:border-line-2 hover:text-fg-1"
              >
                #{r.runNumber} · {formatDate(r.createdAt)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-fg-2">
        <span className="font-medium text-fg-1">Assumptions</span> are what this
        decision depends on; <span className="font-medium text-fg-1">evidence</span>{" "}
        is what you've learned since. Log at least one piece of evidence, then
        review the decision to weigh each assumption against it.
      </p>

      {/* Split view: assumptions ledger + evidence log */}
      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <section aria-labelledby="assumptions-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="assumptions-heading"
              className="text-lg font-semibold text-fg-1"
            >
              Assumptions
            </h2>
            <span className="font-mono text-xs text-fg-3">
              {assumptions.length} total
            </span>
          </div>
          {locked && (
            <p className="mb-3 border-l-2 border-line py-1 pl-4 text-xs leading-relaxed text-fg-3">
              Locked since the first review, so every report stays traceable to
              the assumptions it judged.
            </p>
          )}
          {assumptions.length === 0 ? (
            <p className="border-l-2 border-line py-1 pl-4 text-sm text-fg-3">
              No assumptions on this decision.
            </p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {assumptions.map((a, i) => (
                <AssumptionCard
                  key={a.id}
                  assumption={a}
                  index={i}
                  locked={locked}
                  onSave={updateAssumption}
                  onDelete={deleteAssumption}
                />
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="evidence-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="evidence-heading"
              className="text-lg font-semibold text-fg-1"
            >
              Evidence
            </h2>
            <span className="font-mono text-xs text-fg-3">
              {evidence.length} total
            </span>
          </div>
          <EvidencePanel decisionId={id} locked={locked} />
        </section>
      </div>

      {/* Review action */}
      <div className="mt-10 flex flex-col items-start gap-2 border-t border-line pt-6">
        {canReview ? (
          <Link to={`/decision/${id}/run`} className={btnPrimary}>
            {reports.length > 0 ? "Review decision again" : "Review decision"}
          </Link>
        ) : (
          <>
            <button type="button" disabled className={btnPrimary}>
              Review decision
            </button>
            <p className="text-sm text-fg-2">
              {assumptions.length === 0
                ? "This decision has no assumptions to review."
                : "Log at least one piece of evidence to review this decision."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
