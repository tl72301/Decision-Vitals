import { Link } from "react-router-dom";

export default function AppShell({ children }) {
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
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
