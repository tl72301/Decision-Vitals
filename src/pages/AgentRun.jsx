import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { runAgent } from "../lib/api.js";
import {
  getDecision,
  assumptionsByDecision,
  evidenceByDecision,
  createAgentRun,
  updateAgentRun,
  purgeOrphanRuns,
} from "../lib/store.js";
import { buildAndSaveReport } from "../lib/review.js";
import { btnPrimary } from "../lib/ui.js";
import Spinner from "../components/Spinner.jsx";
import JsonView from "../components/JsonView.jsx";

// The review sequence, in order. Each step's output is the next step's input.
const PIPELINE = [
  { agent: "evidence_review", name: "Evidence Review", role: "Matches each piece of evidence to the assumptions it bears on" },
  { agent: "challenge", name: "Challenge", role: "Makes the strongest honest case against every assumption" },
  { agent: "risk_ranking", name: "Risk Ranking", role: "Assesses where each assumption stands" },
  { agent: "reporter", name: "Reporter", role: "Writes the Decision Health Report" },
];

function StatusIcon({ status }) {
  if (status === "running") return <Spinner className="h-5 w-5" />;
  if (status === "done")
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] bg-brass text-xs font-bold text-ink-950">
        ✓<span className="sr-only"> done</span>
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] bg-bad text-xs font-bold text-ink-950">
        !<span className="sr-only"> failed</span>
      </span>
    );
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] border-2 border-line">
      <span className="sr-only">pending</span>
    </span>
  );
}

export default function AgentRun() {
  const { id } = useParams();
  const navigate = useNavigate();
  const decision = getDecision(id);

  const startedRef = useRef(false);
  // Full inputs and outputs for this run, kept for 'Copy run JSON' (used to
  // capture recordings for Demo Mode).
  const fullRunRef = useRef({ decisionId: id, runId: null, runNumber: null, agents: {} });
  const [copied, setCopied] = useState(false);
  const [runId, setRunId] = useState(null);
  const [steps, setSteps] = useState(
    PIPELINE.map((p) => ({ ...p, status: "pending", inputSummary: "", output: null, durationMs: 0 }))
  );
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!decision) return;
    const assumptions = assumptionsByDecision(id);
    const evidence = evidenceByDecision(id);
    if (assumptions.length === 0 || evidence.length === 0) return; // guarded in render
    startedRef.current = true;
    runPipeline(assumptions, evidence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, id]);

  async function runPipeline(assumptions, evidence) {
    const decisionForAgent = {
      title: decision.title,
      statement: decision.statement,
      context: decision.context,
    };
    const assumptionsForAgent = assumptions.map((a) => ({
      id: a.id,
      text: a.text,
      tier: a.tier,
      signpost: a.signpost,
      loadBearing: a.loadBearing,
      vulnerable: a.vulnerable,
    }));
    const evidenceForAgent = evidence.map((e) => ({
      id: e.id,
      text: e.text,
      sourceType: e.sourceType,
      date: e.date,
    }));

    // Clear out failed/abandoned runs so this review's number lines up with
    // the reports that actually exist.
    purgeOrphanRuns(id);

    // Local working copy of the steps that we mirror into the stored AgentRun.
    let working = PIPELINE.map((p) => ({
      agent: p.agent,
      status: "pending",
      inputSummary: "",
      output: null,
      durationMs: 0,
    }));
    const run = createAgentRun({ decisionId: id, steps: working });
    setRunId(run.id);
    fullRunRef.current.runId = run.id;
    fullRunRef.current.runNumber = run.runNumber;

    const persist = () => {
      setSteps(PIPELINE.map((p, i) => ({ ...p, ...working[i] })));
      updateAgentRun(run.id, { steps: working });
    };

    // Build each step's payload from prior outputs.
    const outputs = {};
    const payloadFor = (agent) => {
      const er = outputs.evidence_review ?? {};
      const ch = outputs.challenge ?? {};
      const rr = outputs.risk_ranking ?? {};
      switch (agent) {
        case "evidence_review":
          return {
            summary: `${assumptionsForAgent.length} assumptions × ${evidenceForAgent.length} evidence entries`,
            payload: { decision: decisionForAgent, assumptions: assumptionsForAgent, evidence: evidenceForAgent },
          };
        case "challenge":
          return {
            summary: `${assumptionsForAgent.length} assumptions, ${(er.mappings ?? []).length} evidence matches`,
            payload: { decision: decisionForAgent, assumptions: assumptionsForAgent, mappings: er.mappings ?? [] },
          };
        case "risk_ranking":
          return {
            summary: `${(er.mappings ?? []).length} evidence matches, ${(ch.challenges ?? []).length} challenges`,
            payload: { assumptions: assumptionsForAgent, mappings: er.mappings ?? [], challenges: ch.challenges ?? [] },
          };
        case "reporter":
          return {
            summary: `assessments for ${(rr.rankings ?? []).length} assumptions`,
            payload: {
              decision: decisionForAgent,
              assumptions: assumptionsForAgent,
              evidence: evidenceForAgent,
              mappings: er.mappings ?? [],
              challenges: ch.challenges ?? [],
              rankings: rr.rankings ?? [],
            },
          };
        default:
          return { summary: "", payload: {} };
      }
    };

    for (let i = 0; i < PIPELINE.length; i++) {
      const { agent } = PIPELINE[i];
      const { summary, payload } = payloadFor(agent);
      working[i] = { ...working[i], status: "running", inputSummary: summary };
      persist();

      const t0 = performance.now();
      try {
        const output = await runAgent(agent, payload, { decisionId: id });
        outputs[agent] = output;
        fullRunRef.current.agents[agent] = { input: payload, output };
        working[i] = {
          ...working[i],
          status: "done",
          output,
          durationMs: Math.round(performance.now() - t0),
        };
        persist();
      } catch (err) {
        working[i] = {
          ...working[i],
          status: "error",
          durationMs: Math.round(performance.now() - t0),
        };
        persist();
        setError(`${PIPELINE[i].name} failed: ${err.message}`);
        return;
      }
    }

    // All four finished: build the numbered Report, apply assumption statuses,
    // and set the decision's health grade.
    buildAndSaveReport(id, run, outputs);
    setDone(true);
  }

  // Copy the full run (inputs and outputs per step) to the clipboard.
  async function copyRunJson() {
    const text = JSON.stringify(
      { ...fullRunRef.current, copiedAt: new Date().toISOString() },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Clipboard unavailable. Copy manually:", text);
    }
  }

  if (!decision) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="text-fg-2">That decision doesn't exist.</p>
        <Link
          to="/"
          className="mt-3 inline-block text-sm font-medium text-brass underline decoration-brass/50 underline-offset-2 hover:text-brass-2"
        >
          Back to decisions
        </Link>
      </div>
    );
  }

  const assumptions = assumptionsByDecision(id);
  const evidence = evidenceByDecision(id);
  if (assumptions.length === 0 || evidence.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="leading-relaxed text-fg-2">
          This decision needs at least one assumption and one piece of evidence
          before it can be reviewed.
        </p>
        <Link
          to={`/decision/${id}`}
          className="mt-3 inline-block text-sm font-medium text-brass underline decoration-brass/50 underline-offset-2 hover:text-brass-2"
        >
          Back to the decision
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to={`/decision/${id}`}
        className="text-sm text-fg-2 transition-colors hover:text-fg-1"
      >
        ← {decision.title || "Decision"}
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-fg-1">
        Reviewing decision
      </h1>
      <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-fg-2">
        The review weighs the evidence for and against each assumption. Each
        stage shows its findings, so you can trace how the assessment was
        reached.
      </p>

      <ol className="mt-8">
        {steps.map((step, i) => (
          <li key={step.agent} className="relative pb-8 pl-9 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[9px] top-7 w-px bg-line"
              />
            )}
            <span className="absolute left-0 top-0.5">
              <StatusIcon status={step.status} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-fg-1">{step.name}</span>
              {step.status === "done" && step.durationMs > 0 && (
                <span className="font-mono text-xs text-fg-3">
                  {(step.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <p className="text-sm text-fg-2">{step.role}</p>
            {step.inputSummary && (
              <p className="mt-1 font-mono text-xs text-fg-3">
                Input: {step.inputSummary}
              </p>
            )}
            {step.output && <JsonView value={step.output} />}
          </li>
        ))}
      </ol>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-bad/40 bg-ink-800 p-4 text-sm"
        >
          <p className="font-medium text-bad">The review stopped</p>
          <p className="mt-1 leading-relaxed text-fg-2">{error}</p>
          <p className="mt-1 text-fg-3">
            Evidence and assumptions are unchanged. Rerunning starts a fresh
            review.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => navigate(0)}
              className="rounded border border-line-2 px-3 py-1.5 text-xs font-medium text-fg-1 transition-colors hover:bg-ink-700"
            >
              Rerun the review
            </button>
            <Link
              to={`/decision/${id}`}
              className="rounded px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg-1"
            >
              Back to the decision
            </Link>
          </div>
        </div>
      )}

      {done && runId && (
        <div className="mt-6 border-t border-line pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/decision/${id}/report/${runId}`} className={btnPrimary}>
              Open health report
            </Link>
            <span role="status" className="text-sm text-fg-2">
              Review complete.
            </span>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer select-none text-sm font-medium text-fg-3 transition-colors hover:text-fg-1">
              Advanced
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyRunJson}
                className="rounded border border-line px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-2 hover:text-fg-1"
              >
                {copied ? "Copied ✓" : "Copy review data"}
              </button>
              <span className="text-xs text-fg-3">
                Copies every stage's full input and output for this review.
              </span>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
