import { useState } from "react";
import { createEvidence, evidenceByDecision, deleteEvidence } from "../lib/store.js";
import { SOURCE_TYPE, sourceTypeLabel, formatDate } from "../lib/labels.js";
import { isDemo } from "../lib/mode.js";
import { pullGmail } from "../lib/api.js";
import { inputCls, fieldLabel } from "../lib/ui.js";
import Spinner from "./Spinner.jsx";

const today = () => new Date().toISOString().slice(0, 10);

// Evidence log: paste a snippet, tag its source and date, add it to the record.
// Adding is always allowed (you log more evidence and review again). Deleting
// is blocked once a review has used the evidence, keeping the record honest.
export default function EvidencePanel({ decisionId, locked }) {
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState("meeting_notes");
  const [date, setDate] = useState(today());
  const [pulling, setPulling] = useState(false);
  const [pullNotice, setPullNotice] = useState("");

  const evidence = evidenceByDecision(decisionId);

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    createEvidence({ decisionId, text: text.trim(), sourceType, date });
    setText("");
  }

  async function pullFromGmail() {
    setPulling(true);
    setPullNotice("");
    try {
      const res = await pullGmail();
      if (!res.ok) {
        setPullNotice(res.error || "Couldn't pull from Gmail.");
      } else {
        for (const item of res.items ?? []) {
          createEvidence({
            decisionId,
            text: item.text,
            sourceType: "email",
            date: item.date,
          });
        }
        const n = res.items?.length ?? 0;
        setPullNotice(
          n === 0
            ? "No new labeled emails to pull."
            : `Pulled ${n} email${n === 1 ? "" : "s"} into this decision.`
        );
      }
    } catch (err) {
      setPullNotice(err.message || "Couldn't pull from Gmail.");
    } finally {
      setPulling(false);
    }
  }

  return (
    <div>
      {!isDemo() && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={pullFromGmail}
            disabled={pulling}
            className="inline-flex min-h-9 items-center gap-2 rounded border border-line px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-2 hover:text-fg-1 disabled:opacity-50"
          >
            {pulling && <Spinner />}
            {pulling ? "Pulling…" : "Pull from Gmail"}
          </button>
          {pullNotice && (
            <span role="status" className="text-xs text-fg-2">
              {pullNotice}
            </span>
          )}
        </div>
      )}

      <form
        onSubmit={add}
        aria-label="Log evidence"
        className="rounded-md border border-line bg-ink-800 p-4"
      >
        <label htmlFor="evidence-text" className={fieldLabel}>
          New evidence
        </label>
        <textarea
          id="evidence-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste a snippet: meeting notes, a support ticket, customer feedback, a market update…"
          className={`mt-1 ${inputCls}`}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <label htmlFor="evidence-source" className={fieldLabel}>
              Source type
            </label>
            <select
              id="evidence-source"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              {Object.entries(SOURCE_TYPE).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="evidence-date" className={fieldLabel}>
              Date
            </label>
            <input
              id="evidence-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            className="inline-flex min-h-10 items-center rounded bg-brass px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-brass-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add evidence
          </button>
        </div>
      </form>

      {evidence.length === 0 ? (
        <p className="mt-4 border-l-2 border-line py-1 pl-4 text-sm leading-relaxed text-fg-2">
          No evidence logged yet. A review weighs evidence against each
          assumption, so it needs at least one entry. Paste the first note,
          ticket, or update above.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {evidence.map((ev) => (
            <li key={ev.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-fg-2">
                  {sourceTypeLabel(ev.sourceType)}
                  {ev.date ? ` · ${formatDate(ev.date)}` : ""}
                </p>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this evidence entry?")) {
                        deleteEvidence(ev.id);
                      }
                    }}
                    className="text-xs font-medium text-fg-3 transition-colors hover:text-bad"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1.5 border-l-2 border-line-2 pl-3 text-[15px] leading-relaxed text-fg-2">
                {ev.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
