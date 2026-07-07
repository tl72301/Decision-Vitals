import { healthGradeMeta } from "../lib/labels.js";
import Chip from "./Chip.jsx";

// Pill showing a decision's overall health grade (or "Not yet reviewed").
export default function HealthBadge({ grade, className = "" }) {
  const meta = healthGradeMeta(grade);
  return (
    <Chip tone={meta.chip} dot={meta.dot} className={className}>
      {meta.label}
    </Chip>
  );
}
