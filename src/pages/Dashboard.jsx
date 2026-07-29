import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listDecisions, assumptionsByDecision } from "../lib/store.js";
import { loadSamples } from "../lib/samples.js";
import { useStoreSync } from "../lib/useStore.js";
import { formatDate, statusMeta } from "../lib/labels.js";
import { btnPrimary, btnSecondary } from "../lib/ui.js";
import HealthBadge from "../components/HealthBadge.jsx";
import Chip from "../components/Chip.jsx";

// Statuses worth calling out on a row, in severity order. "untested" is implied
// by "Unreviewed" so it is not listed individually.
const SUMMARY_STATUSES = ["invalidated", "weakened", "needs_review", "holding"];

function AssumptionSummary({ decisionId, reviewed }) {
  const assumptions = assumptionsByDecision(decisionId);
  const total = assumptions.length;
  const counts = assumptions.reduce((m, a) => {
    m[a.status] = (m[a.status] || 0) + 1;
    return m;
  }, {});

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-mono text-fg-3">
        {total} assumption{total === 1 ? "" : "s"}
      </span>
      {reviewed &&
        SUMMARY_STATUSES.filter((s) => counts[s]).map((s) => (
          <Chip key={s} tone={statusMeta(s).chip} dot={statusMeta(s).dot}>
            {counts[s]} {statusMeta(s).label.toLowerCase()}
          </Chip>
        ))}
    </div>
  );
}

// One decision in the ledger. A row, not a card: title and statement on the
// left, standing and dates on the right, hairline rules between entries.
function DecisionRow({ decision }) {
  const reviewed = decision.healthGrade != null;
  return (
    <li>
      <Link
        to={`/decision/${decision.id}`}
        className="group grid gap-2 px-2 py-4 transition-colors hover:bg-ink-800 sm:grid-cols-[1fr_auto] sm:gap-6"
      >
        <div className="min-w-0">
          <p className="font-medium leading-snug text-fg-1 underline-offset-4 group-hover:underline group-hover:decoration-line-2">
            {decision.title || decision.statement || "Untitled decision"}
          </p>
          {decision.statement && decision.title && (
            <p className="mt-1 line-clamp-1 text-sm text-fg-2">
              {decision.statement}
            </p>
          )}
          <div className="mt-2">
            <AssumptionSummary decisionId={decision.id} reviewed={reviewed} />
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:justify-between">
          <HealthBadge grade={decision.healthGrade} />
          <span className="font-mono text-xs text-fg-2">
            {formatDate(decision.createdAt)}
            {decision.owner ? ` · ${decision.owner}` : ""}
          </span>
        </div>
      </Link>
    </li>
  );
}

const PROCESS = [
  {
    n: "01",
    title: "Record a decision",
    body: "Describe a decision you've made. Decision Vitals identifies the assumptions it depends on and marks which ones are critical.",
  },
  {
    n: "02",
    title: "Log evidence as it arrives",
    body: "Paste meeting notes, support tickets, customer feedback, or market updates. Label an email in Gmail and pull it in without leaving your inbox.",
  },
  {
    n: "03",
    title: "Review the decision",
    body: "The review weighs the evidence for and against each assumption and produces a dated assessment of the decision's health.",
  },
  {
    n: "04",
    title: "Review again as things change",
    body: "Add evidence and review again whenever something moves. Each review is numbered and dated, so you can see what changed since the last one.",
  },
];

function EmptyState({ onLoadSamples }) {
  return (
    <div>
      <h1 className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-fg-1 sm:text-3xl">
        Know when the reasoning behind a decision starts to fail.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-2">
        Every decision rests on a few assumptions about customers, capacity,
        timing, or the market. Decision Vitals records them, then weighs new
        evidence against them as it arrives. Review a decision whenever
        something changes and compare it to the last time you checked.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to="/new" className={btnPrimary}>
          Record a decision
        </Link>
        <button type="button" onClick={onLoadSamples} className={btnSecondary}>
          Load sample decisions
        </button>
      </div>
      <p className="mt-3 text-sm text-fg-2">
        Load a sample to see a completed decision review.
      </p>

      <section className="mt-12" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-sm font-semibold text-fg-2">
          How it works
        </h2>
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {PROCESS.map((step) => (
            <li
              key={step.n}
              className="grid gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-6"
            >
              <span className="font-mono text-xs text-brass">{step.n}</span>
              <div>
                <h3 className="text-sm font-medium text-fg-1">{step.title}</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-2">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function Dashboard() {
  useStoreSync();
  const decisions = listDecisions();
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(null);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Transient feedback: confirm the load, then get out of the way.
  function handleLoadSamples() {
    const n = loadSamples();
    setNotice(
      n > 0
        ? `Loaded ${n} sample decision${n === 1 ? "" : "s"}.`
        : "Sample decisions are already loaded."
    );
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }

  const sorted = decisions
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const reviewed = decisions.filter((d) => d.healthGrade != null).length;

  if (decisions.length === 0) {
    return (
      <div>
        <EmptyState onLoadSamples={handleLoadSamples} />
        {notice && (
          <p role="status" className="mt-4 text-sm text-fg-2">
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg-1">
            Decisions
          </h1>
          <p className="mt-1 font-mono text-xs text-fg-3">
            {decisions.length} recorded · {reviewed} reviewed
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleLoadSamples}
            className={btnSecondary}
          >
            Load sample decisions
          </button>
          <Link to="/new" className={btnPrimary}>
            Record a decision
          </Link>
        </div>
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-fg-2">
          {notice}
        </p>
      )}

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {sorted.map((d) => (
          <DecisionRow key={d.id} decision={d} />
        ))}
      </ul>
    </div>
  );
}
