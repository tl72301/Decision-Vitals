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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
        demo
          ? "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
          : "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-slate-400" : "bg-emerald-500"}`}
      />
      {demo ? "Demo mode" : "Live mode"}
    </button>
  );
}

export default function AppShell({ children }) {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeMode(() => setVersion((v) => v + 1)), []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight">
              Decision Vitals
            </span>
            <span className="text-xs text-slate-500">
              Vital signs for the decisions you've already made
            </span>
          </Link>
          <ModeToggle />
        </div>
      </header>
      {isDemo() && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          Demo mode: replaying recorded agent runs
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
