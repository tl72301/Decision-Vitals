// src/lib/labels.js
//
// Human labels and chip styles for the enums in the data model.
// Night-ledger rules: chips are flat rectangular tags on the dark field, a
// small colored dot or fill carries the semantic meaning, and every status
// always pairs color with a text label.

/** Overall decision health grade. `null` means no review has run yet. */
export const HEALTH_GRADE = {
  healthy: {
    label: "Healthy",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-ok",
  },
  watch: {
    label: "Watch",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-warn",
  },
  at_risk: {
    label: "At Risk",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-bad",
  },
};

export const HEALTH_GRADE_UNREVIEWED = {
  label: "Not yet reviewed",
  chip: "bg-transparent text-fg-3 ring-line",
  dot: "bg-line-2",
};

export function healthGradeMeta(grade) {
  return HEALTH_GRADE[grade] ?? HEALTH_GRADE_UNREVIEWED;
}

/**
 * How important an assumption is to the decision. Critical is the single
 * filled brass tag; the others are outlined neutrals of decreasing weight.
 * (Internal keys stay load_bearing / vulnerable / lower_risk; only the labels
 * are business-facing.)
 */
export const TIER = {
  load_bearing: {
    label: "Critical",
    chip: "bg-brass text-ink-950 ring-brass",
    help: "This one could seriously weaken or break the decision if it turns out to be wrong.",
  },
  vulnerable: {
    label: "Supporting",
    chip: "bg-transparent text-fg-2 ring-line-2",
    help: "Still matters, but the decision can probably survive even if it changes.",
  },
  lower_risk: {
    label: "Minor",
    chip: "bg-transparent text-fg-3 ring-line",
    help: "Not likely to break the decision, and not especially likely to change.",
  },
};

export function tierMeta(tier) {
  return TIER[tier] ?? TIER.lower_risk;
}

/** Per-assumption status. Flat tag + colored dot. */
export const STATUS = {
  untested: {
    label: "Not checked yet",
    chip: "bg-transparent text-fg-3 ring-line",
    dot: "bg-line-2",
  },
  holding: {
    label: "Holding",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-ok",
  },
  weakened: {
    label: "Weakened",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-warn",
  },
  invalidated: {
    label: "Invalidated",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-bad",
  },
  needs_review: {
    label: "Needs review",
    chip: "bg-transparent text-fg-1 ring-line",
    dot: "bg-review",
  },
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
  email: "Email",
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
