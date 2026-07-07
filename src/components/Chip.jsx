// Standard pill chip. `tone` carries the color classes from labels.js so every
// chip in the app shares one size, radius, and weight.
export default function Chip({ tone = "", title, className = "", children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {children}
    </span>
  );
}
