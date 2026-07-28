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
      <div
        role="alert"
        className="mx-auto mt-16 max-w-md rounded-md border border-bad/40 bg-ink-800 p-6"
      >
        <h2 className="text-lg font-semibold text-fg-1">Something went wrong</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-fg-2">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <p className="mt-2 text-sm text-fg-2">
          Your decisions and evidence are stored locally and survive a reload.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-10 items-center rounded bg-brass px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-brass-2"
          >
            Reload page
          </button>
          <a
            href="/"
            className="inline-flex min-h-10 items-center rounded border border-line-2 px-4 py-2 text-sm font-medium text-fg-1 transition-colors hover:bg-ink-700"
          >
            Back to decisions
          </a>
        </div>
      </div>
    );
  }
}
