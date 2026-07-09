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
          className="rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
            {step.n}
          </div>
          <div className="mt-3 text-sm font-semibold text-stone-800">
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

// The centered anchor of the home screen. Present whether or not any decisions
// exist, so the page always reads as a considered landing rather than a bare
// list. CTAs live here; the decisions grid (or the how-it-works primer) follows.
function Hero({ hasDecisions, onLoadSamples }) {
  return (
    <section className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
        Decision monitoring
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
        Watch the assumptions behind your decisions
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-stone-500">
        Every decision rests on a few assumptions about customers, capacity,
        timing, or the market. Decision Vitals surfaces them and tells you when
        the evidence starts to turn against one.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/new"
          className="inline-flex items-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          New decision
        </Link>
        <button
          type="button"
          onClick={onLoadSamples}
          className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          {hasDecisions ? "Load more samples" : "Load sample decisions"}
        </button>
      </div>
      {!hasDecisions && (
        <p className="mt-3 text-xs text-stone-400">
          New here? Loading the samples is the fastest way to see a finished
          review.
        </p>
      )}
    </section>
  );
}

export default function Dashboard() {
  useStoreSync();
  const navigate = useNavigate();
  const decisions = listDecisions();
  const [notice, setNotice] = useState("");
  const hasDecisions = decisions.length > 0;

  function handleLoadSamples() {
    const n = loadSamples();
    setNotice(
      n > 0
        ? `Loaded ${n} sample decision${n === 1 ? "" : "s"}.`
        : "Sample decisions are already loaded."
    );
  }

  const sorted = decisions
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div>
      <div className="py-4 sm:py-8">
        <Hero hasDecisions={hasDecisions} onLoadSamples={handleLoadSamples} />
        {notice && (
          <p className="mt-4 text-center text-xs text-stone-500">{notice}</p>
        )}
      </div>

      {hasDecisions ? (
        <section className="mt-6 border-t border-stone-200 pt-8">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold text-stone-900">
              Your decisions
              <span className="ml-2 text-sm font-normal text-stone-400">
                {decisions.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => navigate("/new")}
              className="text-sm font-medium text-stone-500 transition hover:text-stone-800"
            >
              + New decision
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((d) => (
              <DecisionCard key={d.id} decision={d} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-6 border-t border-stone-200 pt-8">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
            How it works
          </p>
          <HowItWorks />
        </section>
      )}
    </div>
  );
}
