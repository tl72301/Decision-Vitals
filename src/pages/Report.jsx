import { Link, useParams } from "react-router-dom";
import {
  getDecision,
  reportByRun,
  reportsByDecision,
  assumptionsByDecision,
  getEvidence,
} from "../lib/store.js";
import { useStoreSync } from "../lib/useStore.js";
import {
  healthGradeMeta,
  statusMeta,
  tierMeta,
  sourceTypeLabel,
  formatDate,
} from "../lib/labels.js";
import Chip from "../components/Chip.jsx";

// Grade rings for the report header: stronger than the small chips because the
// grade is the report's one headline conclusion.
const GRADE_RING = {
  healthy: "ring-ok/60",
  watch: "ring-warn/60",
  at_risk: "ring-bad/60",
};

function NotFound({ id }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-fg-2">That report doesn't exist.</p>
      <Link
        to={id ? `/decision/${id}` : "/"}
        className="mt-3 inline-block text-sm font-medium text-brass underline decoration-brass/50 underline-offset-2 hover:text-brass-2"
      >
        {id ? "Back to the decision" : "Back to decisions"}
      </Link>
    </div>
  );
}

// One quoted piece of evidence behind an assessment, always with its source
// and date, so the conclusion stays traceable.
function Receipt({ receipt }) {
  const evidence = receipt.evidenceId ? getEvidence(receipt.evidenceId) : null;
  return (
    <li className="border-l-2 border-line-2 bg-ink-900 py-2.5 pl-4 pr-3">
      <p className="max-w-prose text-[15px] leading-relaxed text-fg-1">
        “{receipt.quote}”
      </p>
      {evidence && (
        <p className="mt-1 font-mono text-xs text-fg-2">
          {sourceTypeLabel(evidence.sourceType)}
          {evidence.date ? ` · ${formatDate(evidence.date)}` : ""}
        </p>
      )}
    </li>
  );
}

// Recommended actions as scannable tasks: the action first, then which
// assumption it protects. Owner and timing appear only if the review named
// them inside the action text; nothing is invented.
function ActionList({ actions, byId, indexById }) {
  if (actions.length === 0) {
    return <p className="mt-2 py-2 text-sm text-fg-3">None recommended.</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-line border-y border-line">
      {actions.map((a, i) => {
        const target = byId.get(a.assumptionId);
        return (
          <li key={i} className="py-3">
            <p className="max-w-prose text-[15px] leading-relaxed text-fg-1">
              {a.text}
            </p>
            {target && (
              <p className="mt-1.5 text-sm leading-snug text-fg-2">
                <span className="font-mono text-xs text-fg-3">
                  Protects A{(indexById.get(a.assumptionId) ?? 0) + 1}
                </span>{" "}
                · {target.text}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FindingRow({ finding, assumption, index }) {
  const status = statusMeta(finding.status);
  const tier = assumption ? tierMeta(assumption.tier) : null;
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fg-3">A{index + 1}</span>
        <Chip tone={status.chip} dot={status.dot}>
          {status.label}
        </Chip>
        {tier && (
          <Chip tone={tier.chip} title={tier.help}>
            {tier.label}
          </Chip>
        )}
      </div>
      <p className="mt-2 text-[15px] font-medium leading-relaxed text-fg-1">
        {assumption ? assumption.text : "(assumption removed)"}
      </p>
      {finding.rationale && (
        <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-fg-2">
          {finding.rationale}
        </p>
      )}
      {finding.receipts?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {finding.receipts.map((r, i) => (
            <Receipt key={i} receipt={r} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Report() {
  useStoreSync();
  const { id, runId } = useParams();
  const decision = getDecision(id);
  const report = reportByRun(runId);

  if (!decision || !report) return <NotFound id={decision ? id : null} />;

  const grade = healthGradeMeta(report.healthGrade);
  const allReports = reportsByDecision(id);
  const assumptions = assumptionsByDecision(id);
  const byId = new Map(assumptions.map((a) => [a.id, a]));
  const indexById = new Map(assumptions.map((a, i) => [a.id, i]));

  const shaping = report.actions.filter((a) => a.type === "shaping");
  const hedging = report.actions.filter((a) => a.type === "hedging");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={`/decision/${id}`}
        className="text-sm text-fg-2 transition-colors hover:text-fg-1"
      >
        ← {decision.title || "Decision"}
      </Link>

      {/* Report header: system-generated interpretation, marked with the
          violet rule to distinguish it from the user-authored decision. */}
      <header className="mt-3 rounded-md border border-line border-t-2 border-t-review bg-ink-800 p-6">
        <p className="font-mono text-xs text-fg-3">
          Decision Health Report · Review #{report.runNumber} ·{" "}
          {formatDate(report.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-xl text-xl font-semibold leading-snug text-fg-1 sm:text-2xl">
            {decision.statement || decision.title}
          </h1>
          <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-[3px] px-3 py-1 text-sm font-semibold text-fg-1 ring-1 ring-inset ${
              GRADE_RING[report.healthGrade] ?? "ring-line"
            }`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${grade.dot}`} />
            {grade.label}
          </span>
        </div>
        {report.summary && (
          <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-2">
            {report.summary}
          </p>
        )}

        {allReports.length > 1 && (
          <nav
            aria-label="Reviews of this decision"
            className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          >
            <span className="text-xs font-medium text-fg-2">Reviews:</span>
            {allReports.map((r) => (
              <Link
                key={r.id}
                to={`/decision/${id}/report/${r.runId}`}
                aria-current={r.id === report.id ? "page" : undefined}
                className={`rounded-[3px] border px-2 py-0.5 font-mono text-xs transition-colors ${
                  r.id === report.id
                    ? "border-review bg-review/10 text-fg-1"
                    : "border-line text-fg-2 hover:border-line-2 hover:text-fg-1"
                }`}
              >
                #{r.runNumber} · {formatDate(r.createdAt)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Assessments */}
      <section className="mt-10" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="text-lg font-semibold text-fg-1">
          Where each assumption stands
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          Each assessment includes the evidence behind it.
        </p>
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {report.findings.length === 0 ? (
            <li className="py-4 text-sm text-fg-3">
              This review produced no per-assumption findings.
            </li>
          ) : (
            report.findings.map((f, i) => (
              <FindingRow
                key={i}
                finding={f}
                assumption={byId.get(f.assumptionId)}
                index={indexById.get(f.assumptionId) ?? i}
              />
            ))
          )}
        </ol>
      </section>

      {/* Challenges */}
      {report.challengeHighlights.length > 0 && (
        <section className="mt-10" aria-labelledby="challenges-heading">
          <h2 id="challenges-heading" className="text-lg font-semibold text-fg-1">
            The case against
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            The strongest challenge to each assumption, including the ones that
            still hold.
          </p>
          <ul className="mt-4 space-y-3">
            {report.challengeHighlights.map((h, i) => (
              <li
                key={i}
                className="max-w-prose border-l-2 border-warn py-1 pl-4 text-[15px] leading-relaxed text-fg-2"
              >
                {h}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next actions */}
      {report.actions.length > 0 && (
        <section className="mt-10" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="text-lg font-semibold text-fg-1">
            Next actions
          </h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-fg-1">
                Strengthen{" "}
                <span className="font-normal text-fg-3">
                  (make the assumption more likely to hold)
                </span>
              </h3>
              <ActionList actions={shaping} byId={byId} indexById={indexById} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg-1">
                Prepare a fallback{" "}
                <span className="font-normal text-fg-3">
                  (in case it turns out wrong)
                </span>
              </h3>
              <ActionList actions={hedging} byId={byId} indexById={indexById} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
