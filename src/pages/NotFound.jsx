import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold text-fg-1">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-2">
        That page doesn't exist. It may have been a decision or report that was
        deleted.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-10 items-center rounded bg-brass px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-brass-2"
      >
        Back to decisions
      </Link>
    </div>
  );
}
