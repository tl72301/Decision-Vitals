import { healthGradeMeta } from "../lib/labels.js";

// Rounded pill showing a decision's overall health grade (or "Not yet reviewed").
export default function HealthBadge({ grade, className = "" }) {
  const meta = healthGradeMeta(grade);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip} ${className}`}
    >
      {meta.label}
    </span>
  );
}
