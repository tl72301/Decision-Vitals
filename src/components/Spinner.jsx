// Small inline spinner used in progress states. Always paired with a text
// label in context, so state never depends on the animation alone.
export default function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-brass ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
