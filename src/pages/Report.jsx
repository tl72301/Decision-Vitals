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

function NotFound({ id }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-slate-600">That report doesn't exist.</p>
      <Link
        to={id ? `/decision/${id}` : "/"}
        className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
      >
        {id ? "Back to decision" : "Back to dashboard"}
      </Link>
    </div>
  );
}

function Receipt({ receipt }) {
  const evidence = receipt.evidenceId ? getEvidence(receipt.evidenceId) : null;
  return (
    <li className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
      <p className="text-sm italic text-slate-700">“{receipt.quote}”</p>
      {evidence && (
        <p className="mt-1 text-xs text-slate-400">
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.chip}`}
        >
          {status.label}
        </span>
        {tier && (
          <span
            title={tier.help}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tier.chip}`}
          >
            {tier.label}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-900">
        {assumption ? assumption.text : "(assumption removed)"}
      </p>
      {finding.rationale && (
        <p className="mt-1 text-sm text-slate-600">{finding.rationale}</p>
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
      <Link to={`/decision/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← {decision.title || "Decision"}
      </Link>

      {/* Grade header */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Decision Health Report · Review #{report.runNumber} ·{" "}
              {formatDate(report.createdAt)}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              {decision.statement || decision.title}
            </h1>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${grade.chip}`}
          >
            {grade.label}
          </span>
        </div>
        {report.summary && (
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {report.summary}
          </p>
        )}

        {/* Version switcher */}
        {allReports.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-medium text-slate-500">Reviews:</span>
            {allReports.map((r) => (
              <Link
                key={r.id}
                to={`/decision/${id}/report/${r.runId}`}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  r.id === report.id
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200"
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
        <h2 className="text-lg font-semibold text-slate-900">
          Assumption findings
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Every verdict cites the evidence that drove it.
        </p>
        <div className="mt-4 space-y-3">
          {report.findings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
              The reporter returned no per-assumption findings.
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
          <h2 className="text-lg font-semibold text-slate-900">
            Challenge findings
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            The strongest case against each assumption — even the healthy ones.
          </p>
          <ul className="mt-4 space-y-2">
            {report.challengeHighlights.map((h, i) => (
              <li
                key={i}
                className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-slate-700"
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
          <h2 className="text-lg font-semibold text-slate-900">Next actions</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-slate-600">
                Shaping{" "}
                <span className="font-normal text-slate-400">
                  — strengthen the assumption
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {shaping.length === 0 && (
                  <li className="text-sm text-slate-400">None recommended.</li>
                )}
                {shaping.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm"
                  >
                    {a.text}
                    {byId.get(a.assumptionId) && (
                      <p className="mt-1 text-xs text-slate-400">
                        Protects: {byId.get(a.assumptionId).text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-600">
                Hedging{" "}
                <span className="font-normal text-slate-400">
                  — prepare for it failing
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {hedging.length === 0 && (
                  <li className="text-sm text-slate-400">None recommended.</li>
                )}
                {hedging.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm"
                  >
                    {a.text}
                    {byId.get(a.assumptionId) && (
                      <p className="mt-1 text-xs text-slate-400">
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
