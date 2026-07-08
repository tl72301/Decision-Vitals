import { useState } from "react";
import { createEvidence, evidenceByDecision, deleteEvidence } from "../lib/store.js";
import { SOURCE_TYPE, sourceTypeLabel, formatDate } from "../lib/labels.js";
import { isDemo } from "../lib/mode.js";
import { pullGmail } from "../lib/api.js";
import Chip from "./Chip.jsx";
import Spinner from "./Spinner.jsx";

const today = () => new Date().toISOString().slice(0, 10);

// Evidence inbox: paste a snippet, tag its source and date, add it to the list.
// Adding is always allowed (you add more evidence and re-run). Deleting is
// blocked once a review has used the evidence, keeping receipts honest.
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

  const inputCls =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";

  return (
    <div>
      {!isDemo() && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={pullFromGmail}
            disabled={pulling}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {pulling && <Spinner />}
            {pulling ? "Pulling…" : "Pull from Gmail"}
          </button>
          {pullNotice && <span className="text-xs text-stone-500">{pullNotice}</span>}
        </div>
      )}

      <form onSubmit={add} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste a snippet: meeting notes, a support ticket, customer feedback, a market update…"
          className={inputCls}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <label className="text-xs font-medium text-stone-500">Source type</label>
            <select
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
            <label className="text-xs font-medium text-stone-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Add evidence
          </button>
        </div>
      </form>

      <ul className="mt-4 space-y-3">
        {evidence.length === 0 && (
          <li className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-400">
            No evidence yet. Add at least one snippet to run a review.
          </li>
        )}
        {evidence.map((ev) => (
          <li
            key={ev.id}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <Chip tone="bg-stone-100 text-stone-600 ring-stone-200">
                  {sourceTypeLabel(ev.sourceType)}
                </Chip>
                {ev.date && <span className="text-stone-400">{formatDate(ev.date)}</span>}
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => deleteEvidence(ev.id)}
                  className="text-xs text-stone-400 hover:text-rose-600"
                >
                  Delete
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-stone-700">{ev.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
