import { useState } from "react";
import { createEvidence, evidenceByDecision, deleteEvidence } from "../lib/store.js";
import { SOURCE_TYPE, sourceTypeLabel, formatDate } from "../lib/labels.js";
import Chip from "./Chip.jsx";

const today = () => new Date().toISOString().slice(0, 10);

// Evidence inbox: paste a snippet, tag its source and date, add it to the list.
// Adding is always allowed (you add more evidence and re-run). Deleting is
// blocked once a review has used the evidence, keeping receipts honest.
export default function EvidencePanel({ decisionId, locked }) {
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState("meeting_notes");
  const [date, setDate] = useState(today());

  const evidence = evidenceByDecision(decisionId);

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    createEvidence({ decisionId, text: text.trim(), sourceType, date });
    setText("");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  return (
    <div>
      <form onSubmit={add} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste a snippet: meeting notes, a support ticket, customer feedback, a market update…"
          className={inputCls}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <label className="text-xs font-medium text-slate-500">Source type</label>
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
            <label className="text-xs font-medium text-slate-500">Date</label>
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
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Add evidence
          </button>
        </div>
      </form>

      <ul className="mt-4 space-y-3">
        {evidence.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
            No evidence yet. Add at least one snippet to run a review.
          </li>
        )}
        {evidence.map((ev) => (
          <li
            key={ev.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <Chip tone="bg-slate-100 text-slate-600 ring-slate-200">
                  {sourceTypeLabel(ev.sourceType)}
                </Chip>
                {ev.date && <span className="text-slate-400">{formatDate(ev.date)}</span>}
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={() => deleteEvidence(ev.id)}
                  className="text-xs text-slate-400 hover:text-rose-600"
                >
                  Delete
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-700">{ev.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
