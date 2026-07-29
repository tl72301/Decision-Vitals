import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { runAgent } from "../lib/api.js";
import { createDecision, createAssumptions } from "../lib/store.js";
import { isDemo, subscribeMode } from "../lib/mode.js";
import { requestLiveMode } from "../lib/liveSwitch.js";
import { btnPrimary, btnSecondary, btnQuiet, inputCls, fieldLabel } from "../lib/ui.js";
import Spinner from "../components/Spinner.jsx";

// The two intake steps shown in the progress panel while the decision is read.
const STEP_DEFS = [
  { key: "intake", label: "Read the decision", role: "Drafts the assumptions the decision depends on" },
  { key: "classifier", label: "Classify each assumption", role: "Marks each one critical or supporting and adds a warning signal to watch" },
];

function StepRow({ def, state }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5">
        {state === "running" && <Spinner />}
        {state === "done" && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-brass text-[10px] font-bold text-ink-950">
            ✓<span className="sr-only"> done</span>
          </span>
        )}
        {state === "error" && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-bad text-[10px] font-bold text-ink-950">
            !<span className="sr-only"> failed</span>
          </span>
        )}
        {state === "pending" && (
          <span className="inline-block h-4 w-4 rounded-[3px] border-2 border-line" />
        )}
      </span>
      <div>
        <div
          className={`text-sm font-medium ${
            state === "pending" ? "text-fg-3" : "text-fg-1"
          }`}
        >
          {def.label}
        </div>
        <div className="text-xs text-fg-3">{def.role}</div>
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

  const canSubmit = form.statement.trim().length > 0 && !running;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setRunning(true);
    setError("");
    setSteps({ intake: "running", classifier: "pending" });

    try {
      // Step 1 (Intake): normalize the decision and draft candidate assumptions.
      const intake = await runAgent("intake", {
        statement: form.statement.trim(),
        context: form.context.trim(),
      });
      setSteps({ intake: "done", classifier: "running" });

      // Step 2 (Classifier): tier + signpost per candidate assumption.
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
      setError(err.message || "Something went wrong while identifying assumptions.");
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-fg-1">
        Record a decision
      </h1>
      <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-fg-2">
        Describe a decision you've already made. Decision Vitals identifies the
        3 to 5 assumptions it depends on and marks which ones are critical. You
        log evidence and review the decision on the next screen.
      </p>

      {demo ? (
        <div className="mt-6 rounded-md border border-line bg-ink-800 p-6">
          <h2 className="text-base font-semibold text-fg-1">
            Recording needs Live Mode
          </h2>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-fg-2">
            Demo Mode replays recorded reviews of the sample decisions. It
            can't analyze a new one. Switch to Live Mode with the passphrase to
            record your own.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={requestLiveMode}
              className={btnPrimary}
            >
              Switch to Live Mode
            </button>
            <Link to="/" className={btnSecondary}>
              View sample decisions
            </Link>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="nd-statement" className={fieldLabel}>
            Decision statement
          </label>
          <textarea
            id="nd-statement"
            value={form.statement}
            onChange={update("statement")}
            disabled={running}
            rows={3}
            required
            placeholder="e.g. Extend store hours into the evening starting next month."
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label htmlFor="nd-context" className={fieldLabel}>
            Context <span className="font-normal text-fg-3">(optional)</span>
          </label>
          <textarea
            id="nd-context"
            value={form.context}
            onChange={update("context")}
            disabled={running}
            rows={3}
            placeholder="What prompted it, constraints, stakeholders."
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nd-owner" className={fieldLabel}>
              Owner <span className="font-normal text-fg-3">(optional)</span>
            </label>
            <input
              id="nd-owner"
              type="text"
              value={form.owner}
              onChange={update("owner")}
              disabled={running}
              placeholder="e.g. Casey Rivera"
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="nd-date" className={fieldLabel}>
              Date <span className="font-normal text-fg-3">(optional)</span>
            </label>
            <input
              id="nd-date"
              type="date"
              value={form.date}
              onChange={update("date")}
              disabled={running}
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {running && <Spinner className="border-ink-700 border-t-ink-950" />}
            {running ? "Identifying assumptions…" : "Identify assumptions"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            disabled={running}
            className={btnQuiet}
          >
            Cancel
          </button>
        </div>
      </form>
      )}

      {!demo && (running || error) && (
        <div className="mt-6 rounded-md border border-line bg-ink-800 p-4">
          <p className="text-sm font-medium text-fg-1">
            Identifying the assumptions behind this decision
          </p>
          <ol className="mt-3 space-y-3">
            {STEP_DEFS.map((def) => (
              <StepRow key={def.key} def={def} state={steps[def.key]} />
            ))}
          </ol>
          {error && (
            <div
              role="alert"
              className="mt-4 rounded border border-bad/40 bg-ink-900 p-3 text-sm"
            >
              <p className="font-medium text-bad">Couldn't identify assumptions</p>
              <p className="mt-1 text-fg-2">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSteps({ intake: "pending", classifier: "pending" });
                }}
                className="mt-2 rounded border border-line-2 px-3 py-1 text-xs font-medium text-fg-1 transition-colors hover:bg-ink-700"
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
