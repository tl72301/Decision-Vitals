import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-stone-900">Page not found</h1>
      <p className="mt-2 text-sm text-stone-500">
        That page doesn't exist. It may have been a decision or report that was
        deleted.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
