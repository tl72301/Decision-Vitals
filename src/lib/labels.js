// src/lib/labels.js
//
// Human labels and Tailwind chip styles for the enums in the data model.
// Design language: near-monochrome. Chips are neutral (white/stone) and a small
// colored dot carries the semantic meaning, so the UI stays muted while status
// remains scannable. Tiers are colorless: load-bearing is the one filled chip.

/** Overall decision health grade. `null` means no review has run yet. */
export const HEALTH_GRADE = {
  healthy: {
    label: "Healthy",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-emerald-500",
  },
  watch: {
    label: "Watch",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-amber-500",
  },
  at_risk: {
    label: "At Risk",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-rose-500",
  },
};

export const HEALTH_GRADE_UNREVIEWED = {
  label: "Not yet reviewed",
  chip: "bg-white text-stone-400 ring-stone-200",
  dot: "bg-stone-300",
};

export function healthGradeMeta(grade) {
  return HEALTH_GRADE[grade] ?? HEALTH_GRADE_UNREVIEWED;
}

/**
 * Assumption tier. Colorless by design: load-bearing is the single filled
 * (near-black) chip, the others are outlined neutrals of decreasing weight.
 */
export const TIER = {
  load_bearing: {
    label: "Load-bearing",
    chip: "bg-stone-900 text-white ring-stone-900",
    help: "If this is false, the decision fails or needs major rework.",
  },
  vulnerable: {
    label: "Vulnerable",
    chip: "bg-white text-stone-700 ring-stone-300",
    help: "Could realistically become false within the decision's horizon.",
  },
  lower_risk: {
    label: "Lower-risk",
    chip: "bg-white text-stone-500 ring-stone-200",
    help: "Not decision-breaking and not especially likely to fail.",
  },
};

export function tierMeta(tier) {
  return TIER[tier] ?? TIER.lower_risk;
}

/** Per-assumption status. Neutral chip + colored dot. */
export const STATUS = {
  untested: {
    label: "Untested",
    chip: "bg-white text-stone-500 ring-stone-200",
    dot: "bg-stone-300",
  },
  holding: {
    label: "Holding",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-emerald-500",
  },
  weakened: {
    label: "Weakened",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-amber-500",
  },
  invalidated: {
    label: "Invalidated",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-rose-500",
  },
  needs_review: {
    label: "Needs review",
    chip: "bg-white text-stone-700 ring-stone-200",
    dot: "bg-violet-400",
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
