import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isDemo, setMode, subscribeMode } from "../lib/mode.js";
import { verifyLivePassphrase } from "../lib/api.js";
import { startMcpSync } from "../lib/mcpSync.js";

function ModeToggle() {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeMode(() => setVersion((v) => v + 1)), []);
  const demo = isDemo();

  async function handleToggle() {
    if (!demo) {
      setMode("demo");
      return;
    }
    const passphrase = window.prompt(
      "Live Mode runs real AI reviews (and spends real credits).\nEnter the Live Mode passphrase:"
    );
    if (passphrase === null) return; // cancelled
    const result = await verifyLivePassphrase(passphrase);
    if (result.ok) {
      setMode("live", passphrase);
    } else {
      window.alert(result.error || "Incorrect passphrase.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={
        demo
          ? "Switch to Live Mode (passphrase required)"
          : "Switch back to Demo Mode"
      }
      className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded border border-line px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-2 hover:text-fg-1"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-fg-3" : "bg-ok"}`}
      />
      {demo ? "Demo mode" : "Live mode"}
    </button>
  );
}

export default function AppShell({ children }) {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeMode(() => setVersion((v) => v + 1)), []);
  useEffect(() => startMcpSync(), []); // Live Mode only; no-op in Demo Mode

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brass focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-line bg-ink-950/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span aria-hidden="true" className="block h-2.5 w-2.5 rotate-45 bg-brass" />
            <span className="text-base font-semibold tracking-tight text-fg-1">
              Decision Vitals
            </span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4">
            <Link
              to="/about"
              className="text-sm font-medium text-fg-2 transition-colors hover:text-fg-1"
            >
              About
            </Link>
            <ModeToggle />
          </nav>
        </div>
      </header>
      {isDemo() && (
        <p className="border-b border-line bg-ink-900 px-4 py-1.5 text-center font-mono text-xs text-fg-3">
          Demo · replaying recorded reviews
        </p>
      )}
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8">
        {children}
      </main>
      <footer className="mx-auto mt-8 w-full max-w-5xl px-4 pb-10">
        <div className="border-t border-line pt-5 text-xs text-fg-3">
          Method:{" "}
          <a
            href="https://www.rand.org/pubs/monograph_reports/MR114.html"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-2 underline-offset-2 transition-colors hover:text-fg-1"
          >
            Assumption-Based Planning
          </a>{" "}
          (RAND) ·{" "}
          <Link
            to="/about"
            className="underline decoration-line-2 underline-offset-2 transition-colors hover:text-fg-1"
          >
            About Decision Vitals
          </Link>
        </div>
      </footer>
    </div>
  );
}
