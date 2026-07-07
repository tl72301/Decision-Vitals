// Small inline spinner used in progress states.
export default function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
