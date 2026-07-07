import { Component } from "react";

// Catches rendering errors anywhere in the tree and shows a recovery card
// instead of a blank page. State in localStorage survives the reload.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-rose-800">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-rose-700">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
          >
            Reload
          </button>
          <a
            href="/"
            className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
