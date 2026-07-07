import { useState } from "react";
import { tierMeta, statusMeta, TIER } from "../lib/labels.js";
import Chip from "./Chip.jsx";

// One assumption. Before the first review it supports inline reword / retier /
// re-signpost and delete (human-in-the-loop). After a review it is read-only.
export default function AssumptionCard({ assumption, locked, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    text: assumption.text,
    tier: assumption.tier,
    signpost: assumption.signpost,
  });

  const tier = tierMeta(assumption.tier);
  const status = statusMeta(assumption.status);

  function startEdit() {
    setDraft({
      text: assumption.text,
      tier: assumption.tier,
      signpost: assumption.signpost,
    });
    setEditing(true);
  }

  function save() {
    onSave(assumption.id, {
      text: draft.text.trim(),
      signpost: draft.signpost.trim(),
      tier: draft.tier,
      loadBearing: draft.tier === "load_bearing",
      vulnerable: draft.tier === "vulnerable",
      userEdited: true,
    });
    setEditing(false);
  }

  if (editing) {
    const inputCls =
      "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";
    return (
      <div className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-stone-500">Assumption</label>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          rows={2}
          className={`mt-1 ${inputCls}`}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-stone-500">Tier</label>
            <select
              value={draft.tier}
              onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}
              className={`mt-1 ${inputCls}`}
            >
              {Object.entries(TIER).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Signpost</label>
            <input
              value={draft.signpost}
              onChange={(e) =>
                setDraft((d) => ({ ...d, signpost: e.target.value }))
              }
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.text.trim()}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={tier.chip} title={tier.help}>
            {tier.label}
          </Chip>
          <Chip tone={status.chip} dot={status.dot}>
            {status.label}
          </Chip>
          {assumption.userEdited && (
            <span className="text-xs text-stone-400">edited</span>
          )}
        </div>
        {!locked && (
          <div className="flex shrink-0 gap-2 text-xs">
            <button
              type="button"
              onClick={startEdit}
              className="text-stone-500 hover:text-stone-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(assumption.id)}
              className="text-stone-400 hover:text-rose-600"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-800">{assumption.text}</p>
      {assumption.signpost && (
        <p className="mt-2 text-xs text-stone-500">
          <span className="font-medium text-stone-600">Signpost:</span>{" "}
          {assumption.signpost}
        </p>
      )}
    </div>
  );
}
