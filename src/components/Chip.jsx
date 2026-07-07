// Standard pill chip. `tone` carries the chip color classes from labels.js and
// the optional `dot` a small colored indicator, the muted design's only color.
export default function Chip({ tone = "", dot, title, className = "", children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}
