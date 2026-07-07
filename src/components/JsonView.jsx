// Collapsible pretty-printed JSON. Used to expose each agent's real I/O in the
// Agent Run view — the visible proof of the typed multi-agent handoffs.
export default function JsonView({ value, label = "View output", defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="mt-3 rounded-lg bg-slate-900/95">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-300 hover:text-white">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto px-3 pb-3 text-xs leading-relaxed text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
