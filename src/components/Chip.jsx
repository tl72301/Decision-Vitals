// Flat rectangular tag. `tone` carries the color classes from labels.js and
// the optional `dot` a small status indicator. Status meaning is always
// carried by the label text as well, never by color alone.
export default function Chip({ tone = "", dot, title, className = "", children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}
