import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listDecisions, assumptionsByDecision } from "../lib/store.js";
import { useStoreSync } from "../lib/useStore.js";
import { formatDate, statusMeta } from "../lib/labels.js";
import HealthBadge from "../components/HealthBadge.jsx";

// Statuses worth calling out on a card, in severity order. "untested" is implied
// by "Not yet reviewed" so it is not listed individually.
const SUMMARY_STATUSES = ["invalidated", "weakened", "needs_review", "holding"];

function AssumptionSummary({ decisionId, reviewed }) {
  const assumptions = assumptionsByDecision(decisionId);
  const total = assumptions.length;
  const counts = assumptions.reduce((m, a) => {
    m[a.status] = (m[a.status] || 0) + 1;
    return m;
  }, {});

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-slate-500">
        {total} assumption{total === 1 ? "" : "s"}
      </span>
      {reviewed ? (
        SUMMARY_STATUSES.filter((s) => counts[s]).map((s) => (
          <span
            key={s}
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${statusMeta(s).chip}`}
          >
            {counts[s]} {statusMeta(s).label.toLowerCase()}
          </span>
        ))
      ) : (
        <span className="text-slate-400">· not yet reviewed</span>
      )}
    </div>
  );
}

function DecisionCard({ decision }) {
  const reviewed = decision.healthGrade != null;
  return (
    <Link
      to={`/decision/${decision.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug text-slate-900 group-hover:text-slate-700">
          {decision.title || decision.statement || "Untitled decision"}
        </h3>
        <HealthBadge grade={decision.healthGrade} className="shrink-0" />
      </div>
      {decision.statement && decision.title && (
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
          {decision.statement}
        </p>
      )}
      <AssumptionSummary decisionId={decision.id} reviewed={reviewed} />
      <div className="mt-3 text-xs text-slate-400">
        {formatDate(decision.createdAt)}
        {decision.owner ? ` · ${decision.owner}` : ""}
      </div>
    </Link>
  );
}

function EmptyState({ onLoadSamples, notice }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        No decisions yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Register a business decision and Decision Vitals extracts the
        assumptions underneath it, then watches them as evidence comes in.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/new"
          className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          New decision
        </Link>
        <button
          type="button"
          onClick={onLoadSamples}
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Load sample decisions
        </button>
      </div>
      {notice && <p className="mt-4 text-xs text-slate-500">{notice}</p>}
    </div>
  );
}

export default function Dashboard() {
  useStoreSync();
  const navigate = useNavigate();
  const decisions = listDecisions();
  const [notice, setNotice] = useState("");

  // Sample decisions and their loader arrive in a later build step (PLAN.md
  // Section 9, items 12–13). The button is wired now and activated then.
  function handleLoadSamples() {
    setNotice("Sample decisions are added in a later build step.");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Your decisions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Vital signs for the decisions you've already made.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/new")}
          className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          New decision
        </button>
      </div>

      {decisions.length === 0 ? (
        <EmptyState onLoadSamples={handleLoadSamples} notice={notice} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decisions
            .slice()
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .map((d) => (
              <DecisionCard key={d.id} decision={d} />
            ))}
        </div>
      )}
    </div>
  );
}
