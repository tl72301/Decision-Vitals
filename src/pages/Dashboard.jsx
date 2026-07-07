import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listDecisions, assumptionsByDecision } from "../lib/store.js";
import { loadSamples } from "../lib/samples.js";
import { useStoreSync } from "../lib/useStore.js";
import { formatDate, statusMeta } from "../lib/labels.js";
import HealthBadge from "../components/HealthBadge.jsx";
import Chip from "../components/Chip.jsx";

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
      <span className="text-stone-500">
        {total} assumption{total === 1 ? "" : "s"}
      </span>
      {reviewed ? (
        SUMMARY_STATUSES.filter((s) => counts[s]).map((s) => (
          <Chip key={s} tone={statusMeta(s).chip} dot={statusMeta(s).dot}>
            {counts[s]} {statusMeta(s).label.toLowerCase()}
          </Chip>
        ))
      ) : (
        <span className="text-stone-400">· not yet reviewed</span>
      )}
    </div>
  );
}

function DecisionCard({ decision }) {
  const reviewed = decision.healthGrade != null;
  return (
    <Link
      to={`/decision/${decision.id}`}
      className="group flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug text-stone-900 group-hover:text-stone-700">
          {decision.title || decision.statement || "Untitled decision"}
        </h3>
        <HealthBadge grade={decision.healthGrade} className="shrink-0" />
      </div>
      {decision.statement && decision.title && (
        <p className="mt-1 line-clamp-2 text-sm text-stone-500">
          {decision.statement}
        </p>
      )}
      <AssumptionSummary decisionId={decision.id} reviewed={reviewed} />
      <div className="mt-3 text-xs text-stone-400">
        {formatDate(decision.createdAt)}
        {decision.owner ? ` · ${decision.owner}` : ""}
      </div>
    </Link>
  );
}

const HOW_IT_WORKS = [
  {
    n: "1",
    title: "Register a decision",
    body: "Two agents read it and pull out the handful of assumptions it depends on, flagging which are critical (the decision could break if they're wrong).",
  },
  {
    n: "2",
    title: "Add evidence over time",
    body: "Paste in what you learn as it lands: meeting notes, support tickets, customer feedback, market updates.",
  },
  {
    n: "3",
    title: "Run a review",
    body: "Four agents map the evidence to each assumption, argue against it, and grade the decision's health, with a receipt behind every verdict.",
  },
];

function HowItWorks() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {HOW_IT_WORKS.map((step) => (
        <div
          key={step.n}
          className="rounded-xl border border-stone-200 bg-white p-4 text-left"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
            {step.n}
          </div>
          <div className="mt-2 text-sm font-semibold text-stone-800">
            {step.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {step.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onLoadSamples, notice }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 sm:p-10">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-stone-900">
          Watch the assumptions behind your decisions
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">
          Every decision rests on a few assumptions about customers, capacity,
          timing, or the market. Decision Vitals surfaces them and tells you
          when the evidence starts to turn against one.
        </p>
      </div>

      <div className="mt-8">
        <HowItWorks />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/new"
          className="inline-flex items-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          New decision
        </Link>
        <button
          type="button"
          onClick={onLoadSamples}
          className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          Load sample decisions
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-stone-400">
        New here? Loading the samples is the fastest way to see a finished review.
      </p>
      {notice && <p className="mt-2 text-center text-xs text-stone-500">{notice}</p>}
    </div>
  );
}

export default function Dashboard() {
  useStoreSync();
  const navigate = useNavigate();
  const decisions = listDecisions();
  const [notice, setNotice] = useState("");

  function handleLoadSamples() {
    const n = loadSamples();
    setNotice(
      n > 0
        ? `Loaded ${n} sample decision${n === 1 ? "" : "s"}.`
        : "Sample decisions are already loaded."
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-stone-900">
          Your decisions
        </h1>
        <button
          type="button"
          onClick={() => navigate("/new")}
          className="inline-flex items-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
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
