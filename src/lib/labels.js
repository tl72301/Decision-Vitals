// src/lib/labels.js
//
// Human labels and Tailwind chip styles for the enums in the data model.
// Centralized so the Dashboard, cards, and report all read the same way.
// Colors get a dedicated polish pass later (PLAN.md Section 9, item 17).

/** Overall decision health grade. `null` means no review has run yet. */
export const HEALTH_GRADE = {
  healthy: { label: "Healthy", chip: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  watch: { label: "Watch", chip: "bg-amber-100 text-amber-800 ring-amber-200" },
  at_risk: { label: "At Risk", chip: "bg-rose-100 text-rose-800 ring-rose-200" },
};

export const HEALTH_GRADE_UNREVIEWED = {
  label: "Not yet reviewed",
  chip: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function healthGradeMeta(grade) {
  return HEALTH_GRADE[grade] ?? HEALTH_GRADE_UNREVIEWED;
}

/** Assumption tier (derived label for the UI). */
export const TIER = {
  load_bearing: {
    label: "Load-bearing",
    chip: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    help: "If this is false, the decision fails or needs major rework.",
  },
  vulnerable: {
    label: "Vulnerable",
    chip: "bg-amber-100 text-amber-800 ring-amber-200",
    help: "Could realistically become false within the decision's horizon.",
  },
  lower_risk: {
    label: "Lower-risk",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
    help: "Not decision-breaking and not especially likely to fail.",
  },
};

export function tierMeta(tier) {
  return TIER[tier] ?? TIER.lower_risk;
}

/** Per-assumption status after (or before) a review. */
export const STATUS = {
  untested: { label: "Untested", chip: "bg-slate-100 text-slate-600 ring-slate-200" },
  holding: { label: "Holding", chip: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  weakened: { label: "Weakened", chip: "bg-amber-100 text-amber-800 ring-amber-200" },
  invalidated: { label: "Invalidated", chip: "bg-rose-100 text-rose-800 ring-rose-200" },
  needs_review: { label: "Needs review", chip: "bg-violet-100 text-violet-800 ring-violet-200" },
};

export function statusMeta(status) {
  return STATUS[status] ?? STATUS.untested;
}

/** Evidence source types. */
export const SOURCE_TYPE = {
  meeting_notes: "Meeting notes",
  customer_feedback: "Customer feedback",
  support_ticket: "Support ticket",
  market_update: "Market update",
  status_update: "Status update",
};

export function sourceTypeLabel(type) {
  return SOURCE_TYPE[type] ?? type;
}

/** Short, locale-friendly date from an ISO or plain date string. */
export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
