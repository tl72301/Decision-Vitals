// Collapsible pretty-printed JSON. Exposes each review step's full output so
// a conclusion can be traced to the exact findings that produced it.
export default function JsonView({ value, label = "View reasoning", defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="mt-3 rounded border border-line bg-ink-900">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-fg-3 transition-colors hover:text-fg-1">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-line px-3 py-3 font-mono text-xs leading-relaxed text-fg-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
