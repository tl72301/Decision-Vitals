import { useState } from "react";
import { tierMeta, statusMeta, TIER } from "../lib/labels.js";
import { inputCls, fieldLabel } from "../lib/ui.js";
import Chip from "./Chip.jsx";

// One assumption as a ledger entry: index, importance, current status, the
// assumption itself, and the warning signal to watch. Before the first review
// it can be reworded, reranked, or deleted (delete lives inside Edit, behind
// a confirm); after a review it is read-only.
export default function AssumptionCard({ assumption, index, locked, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    text: assumption.text,
    tier: assumption.tier,
    signpost: assumption.signpost,
  });

  const tier = tierMeta(assumption.tier);
  const status = statusMeta(assumption.status);
  const ref = `A${index + 1}`;

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
    return (
      <li className="rounded-md border border-line-2 bg-ink-800 p-4">
        <label htmlFor={`a-text-${assumption.id}`} className={fieldLabel}>
          Assumption {ref}
        </label>
        <textarea
          id={`a-text-${assumption.id}`}
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          rows={2}
          className={`mt-1 ${inputCls}`}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`a-tier-${assumption.id}`} className={fieldLabel}>
              Importance
            </label>
            <select
              id={`a-tier-${assumption.id}`}
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
            <label htmlFor={`a-sig-${assumption.id}`} className={fieldLabel}>
              Warning signal
            </label>
            <input
              id={`a-sig-${assumption.id}`}
              value={draft.signpost}
              onChange={(e) =>
                setDraft((d) => ({ ...d, signpost: e.target.value }))
              }
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.text.trim()}
            className="rounded bg-brass px-3 py-2 text-xs font-semibold text-ink-950 transition-colors hover:bg-brass-2 disabled:opacity-40"
          >
            Save changes
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded px-3 py-2 text-xs font-medium text-fg-2 transition-colors hover:text-fg-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Delete assumption ${ref}? The review will no longer consider it.`
                )
              ) {
                onDelete(assumption.id);
              }
            }}
            className="ml-auto rounded px-3 py-2 text-xs font-medium text-fg-3 transition-colors hover:text-bad"
          >
            Delete assumption
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-fg-3">{ref}</span>
          <Chip tone={tier.chip} title={tier.help}>
            {tier.label}
          </Chip>
          <Chip tone={status.chip} dot={status.dot}>
            {status.label}
          </Chip>
          {assumption.userEdited && (
            <span className="font-mono text-xs text-fg-3">edited</span>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 rounded border border-line px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:border-line-2 hover:text-fg-1"
          >
            Edit
          </button>
        )}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-1">{assumption.text}</p>
      {assumption.signpost && (
        <p className="mt-2 flex gap-2 text-sm leading-relaxed text-fg-2">
          <span aria-hidden="true" className="mt-px text-warn">
            ▲
          </span>
          <span>
            <span className="font-medium">Warning signal:</span>{" "}
            {assumption.signpost}
          </span>
        </p>
      )}
    </li>
  );
}
