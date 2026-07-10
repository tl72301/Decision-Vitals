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

function NotFound({ id }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
      <p className="text-stone-600">That report doesn't exist.</p>
      <Link
        to={id ? `/decision/${id}` : "/"}
        className="mt-3 inline-block text-sm font-medium text-stone-900 underline"
      >
        {id ? "Back to decision" : "Back to dashboard"}
      </Link>
    </div>
  );
}

function Receipt({ receipt }) {
  const evidence = receipt.evidenceId ? getEvidence(receipt.evidenceId) : null;
  return (
    <li className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200">
      <p className="text-sm italic text-stone-700">“{receipt.quote}”</p>
      {evidence && (
        <p className="mt-1 text-xs text-stone-400">
          {sourceTypeLabel(evidence.sourceType)}
          {evidence.date ? ` · ${formatDate(evidence.date)}` : ""}
        </p>
      )}
    </li>
  );
}

function FindingRow({ finding, assumption }) {
  const status = statusMeta(finding.status);
  const tier = assumption ? tierMeta(assumption.tier) : null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={status.chip} dot={status.dot}>
          {status.label}
        </Chip>
        {tier && (
          <Chip tone={tier.chip} title={tier.help}>
            {tier.label}
          </Chip>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-stone-900">
        {assumption ? assumption.text : "(assumption removed)"}
      </p>
      {finding.rationale && (
        <p className="mt-1 text-sm text-stone-600">{finding.rationale}</p>
      )}
      {finding.receipts?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {finding.receipts.map((r, i) => (
            <Receipt key={i} receipt={r} />
          ))}
        </ul>
      )}
    </div>
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

  const shaping = report.actions.filter((a) => a.type === "shaping");
  const hedging = report.actions.filter((a) => a.type === "hedging");

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/decision/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
        ← {decision.title || "Decision"}
      </Link>

      {/* Grade header */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
              Decision Health Report · Review #{report.runNumber} ·{" "}
              {formatDate(report.createdAt)}
            </p>
            <h1 className="mt-1 text-xl font-semibold leading-snug text-stone-900 sm:text-2xl">
              {decision.statement || decision.title}
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${grade.chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${grade.dot}`} />
            {grade.label}
          </span>
        </div>
        {report.summary && (
          <p className="mt-4 max-w-prose text-base leading-relaxed text-stone-700">
            {report.summary}
          </p>
        )}

        {/* Version switcher */}
        {allReports.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            <span className="text-xs font-medium text-stone-500">Reviews:</span>
            {allReports.map((r) => (
              <Link
                key={r.id}
                to={`/decision/${id}/report/${r.runId}`}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  r.id === report.id
                    ? "bg-stone-900 text-white ring-stone-900"
                    : "bg-stone-100 text-stone-700 ring-stone-200 hover:bg-stone-200"
                }`}
              >
                #{r.runNumber}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Findings */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-stone-900">
          Where each assumption stands
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Each assessment includes the evidence behind it.
        </p>
        <div className="mt-4 space-y-3">
          {report.findings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-400">
              This review produced no per-assumption findings.
            </p>
          ) : (
            report.findings.map((f, i) => (
              <FindingRow key={i} finding={f} assumption={byId.get(f.assumptionId)} />
            ))
          )}
        </div>
      </section>

      {/* Challenge highlights */}
      {report.challengeHighlights.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900">
            The case against
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            The strongest challenge to each assumption, including the ones that
            still hold.
          </p>
          <ul className="mt-4 space-y-2">
            {report.challengeHighlights.map((h, i) => (
              <li
                key={i}
                className="rounded-lg border-l-2 border-stone-400 bg-stone-100/60 px-4 py-3 text-sm leading-relaxed text-stone-700"
              >
                {h}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next actions */}
      {report.actions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900">Next actions</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-stone-700">
                Strengthen it{" "}
                <span className="font-normal text-stone-400">
                  (make the assumption more likely to hold)
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {shaping.length === 0 && (
                  <li className="text-sm text-stone-400">None recommended.</li>
                )}
                {shaping.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700 shadow-sm"
                  >
                    {a.text}
                    {byId.get(a.assumptionId) && (
                      <p className="mt-1 text-xs text-stone-400">
                        Protects: {byId.get(a.assumptionId).text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-700">
                Prepare a fallback{" "}
                <span className="font-normal text-stone-400">
                  (in case it turns out wrong)
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {hedging.length === 0 && (
                  <li className="text-sm text-stone-400">None recommended.</li>
                )}
                {hedging.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700 shadow-sm"
                  >
                    {a.text}
                    {byId.get(a.assumptionId) && (
                      <p className="mt-1 text-xs text-stone-400">
                        Protects: {byId.get(a.assumptionId).text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
