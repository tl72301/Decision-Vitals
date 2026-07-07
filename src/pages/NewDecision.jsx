import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runAgent } from "../lib/api.js";
import { createDecision, createAssumptions } from "../lib/store.js";
import { isDemo, subscribeMode } from "../lib/mode.js";
import Spinner from "../components/Spinner.jsx";

// The two Phase-A steps shown in the progress panel while agents run.
const STEP_DEFS = [
  { key: "intake", label: "Decision Intake", role: "Cleans the decision and drafts candidate assumptions" },
  { key: "classifier", label: "Assumption Classifier", role: "Labels each assumption load-bearing / vulnerable and adds a signpost" },
];

function StepRow({ def, state }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5">
        {state === "running" && <Spinner />}
        {state === "done" && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
            ✓
          </span>
        )}
        {state === "error" && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-400 text-[10px] font-bold text-white">
            !
          </span>
        )}
        {state === "pending" && (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-stone-200" />
        )}
      </span>
      <div>
        <div
          className={`text-sm font-medium ${
            state === "pending" ? "text-stone-400" : "text-stone-800"
          }`}
        >
          {def.label}
        </div>
        <div className="text-xs text-stone-500">{def.role}</div>
      </div>
    </li>
  );
}

export default function NewDecision() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    statement: "",
    context: "",
    owner: "",
    date: "",
  });
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState({ intake: "pending", classifier: "pending" });
  const [error, setError] = useState("");

  const [, setModeVersion] = useState(0);
  useEffect(() => subscribeMode(() => setModeVersion((v) => v + 1)), []);
  const demo = isDemo();

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const canSubmit = form.statement.trim().length > 0 && !running && !demo;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setRunning(true);
    setError("");
    setSteps({ intake: "running", classifier: "pending" });

    try {
      // Step 1 — Intake: normalize the decision and draft candidate assumptions.
      const intake = await runAgent("intake", {
        statement: form.statement.trim(),
        context: form.context.trim(),
      });
      setSteps({ intake: "done", classifier: "running" });

      // Step 2 — Classifier: tier + signpost per candidate assumption.
      const candidates = intake.assumptions ?? [];
      const classifier = await runAgent("classifier", {
        decision: { title: intake.title, statement: intake.statement },
        assumptions: candidates,
      });
      setSteps({ intake: "done", classifier: "done" });

      // Persist only after both agents succeed, so a failure leaves no orphan.
      const decision = createDecision({
        title: intake.title || form.statement.trim().slice(0, 60),
        statement: intake.statement || form.statement.trim(),
        context: form.context.trim(),
        owner: form.owner.trim(),
        createdAt: form.date ? new Date(form.date).toISOString() : undefined,
      });

      const classified = classifier.assumptions?.length
        ? classifier.assumptions
        : candidates.map((text) => ({ text }));

      createAssumptions(
        classified.map((a) => ({
          decisionId: decision.id,
          text: a.text ?? "",
          loadBearing: !!a.loadBearing,
          vulnerable: !!a.vulnerable,
          tier:
            a.tier ||
            (a.loadBearing ? "load_bearing" : a.vulnerable ? "vulnerable" : "lower_risk"),
          signpost: a.signpost ?? "",
          status: "untested",
          userEdited: false,
        }))
      );

      navigate(`/decision/${decision.id}`);
    } catch (err) {
      setSteps((s) => ({
        intake: s.intake === "running" ? "error" : s.intake,
        classifier: s.classifier === "running" ? "error" : s.classifier,
      }));
      setError(err.message || "Something went wrong while extracting assumptions.");
      setRunning(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-900">New decision</h1>
      <p className="mt-1 text-sm text-stone-500">
        Describe a decision you've already made. Decision Vitals extracts the
        assumptions underneath it.
      </p>

      {demo && (
        <div className="mt-4 rounded-lg border-l-2 border-stone-400 bg-stone-100/60 px-4 py-3 text-sm text-stone-600">
          Demo Mode replays recorded agent runs on the sample decisions, so it
          can't extract assumptions from a new decision. Switch to Live Mode
          (header toggle) to register your own.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-stone-700">
            Decision statement
          </label>
          <textarea
            value={form.statement}
            onChange={update("statement")}
            disabled={running}
            rows={3}
            required
            placeholder="e.g. Migrate our B2B product from per-seat pricing to usage-based billing in Q4."
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-stone-700">
            Context <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <textarea
            value={form.context}
            onChange={update("context")}
            disabled={running}
            rows={3}
            placeholder="What prompted it, constraints, stakeholders."
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-stone-700">
              Owner <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              type="text"
              value={form.owner}
              onChange={update("owner")}
              disabled={running}
              placeholder="e.g. Casey Rivera"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700">
              Date <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              type="date"
              value={form.date}
              onChange={update("date")}
              disabled={running}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running && <Spinner className="border-stone-500 border-t-white" />}
            {running ? "Extracting assumptions…" : "Extract assumptions"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            disabled={running}
            className="text-sm text-stone-500 hover:text-stone-700 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>

      {(running || error) && (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-medium text-stone-700">
            Running the assumption pipeline
          </div>
          <ol className="mt-3 space-y-3">
            {STEP_DEFS.map((def) => (
              <StepRow key={def.key} def={def} state={steps[def.key]} />
            ))}
          </ol>
          {error && (
            <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <p className="font-medium">Couldn't extract assumptions</p>
              <p className="mt-1 text-rose-600">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSteps({ intake: "pending", classifier: "pending" });
                }}
                className="mt-2 rounded-md bg-white px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
