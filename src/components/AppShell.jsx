import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isDemo, setMode, subscribeMode } from "../lib/mode.js";
import { verifyLivePassphrase } from "../lib/api.js";

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
      "Live Mode runs real agent sessions (and spends real credits).\nEnter the Live Mode passphrase:"
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
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-300 transition hover:bg-stone-50"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-stone-400" : "bg-emerald-500"}`}
      />
      {demo ? "Demo mode" : "Live mode"}
    </button>
  );
}

export default function AppShell({ children }) {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeMode(() => setVersion((v) => v + 1)), []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 antialiased">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight">
              Decision Vitals
            </span>
            <span className="text-xs text-stone-500">
              Vital signs for the decisions you've already made
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/about"
              className="text-xs font-medium text-stone-500 hover:text-stone-800"
            >
              About
            </Link>
            <ModeToggle />
          </div>
        </div>
      </header>
      {isDemo() && (
        <div className="border-b border-stone-200 bg-stone-100/80 px-4 py-1.5 text-center text-xs text-stone-500">
          Demo mode: replaying recorded agent runs
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-4 text-xs text-stone-400">
        Inspired by{" "}
        <a
          href="https://www.rand.org/pubs/monograph_reports/MR114.html"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-stone-300 underline-offset-2 hover:text-stone-600"
        >
          Assumption-Based Planning
        </a>{" "}
        (RAND) ·{" "}
        <Link to="/about" className="underline decoration-stone-300 underline-offset-2 hover:text-stone-600">
          Case study
        </Link>
      </footer>
    </div>
  );
}
