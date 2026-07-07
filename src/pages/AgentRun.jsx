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
import Spinner from "../components/Spinner.jsx";
import JsonView from "../components/JsonView.jsx";

// The Phase-B pipeline, in order. Each step's output is the next step's input.
const PIPELINE = [
  { agent: "evidence_review", name: "Evidence Review", role: "Maps each snippet to the assumptions it bears on" },
  { agent: "challenge", name: "Challenge", role: "Argues the strongest honest case against every assumption" },
  { agent: "risk_ranking", name: "Risk Ranking", role: "Assigns each assumption a status, applying the hard rules" },
  { agent: "reporter", name: "Reporter", role: "Writes the Decision Health Report" },
];

function StatusIcon({ status }) {
  if (status === "running") return <Spinner />;
  if (status === "done")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
        ✓
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-400 text-xs font-bold text-white">
        !
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-stone-200 text-xs text-stone-400">
      •
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
            summary: `${assumptionsForAgent.length} assumptions × ${evidenceForAgent.length} evidence snippets`,
            payload: { decision: decisionForAgent, assumptions: assumptionsForAgent, evidence: evidenceForAgent },
          };
        case "challenge":
          return {
            summary: `${assumptionsForAgent.length} assumptions, ${(er.mappings ?? []).length} mappings`,
            payload: { decision: decisionForAgent, assumptions: assumptionsForAgent, mappings: er.mappings ?? [] },
          };
        case "risk_ranking":
          return {
            summary: `${(er.mappings ?? []).length} mappings, ${(ch.challenges ?? []).length} challenges`,
            payload: { assumptions: assumptionsForAgent, mappings: er.mappings ?? [], challenges: ch.challenges ?? [] },
          };
        case "reporter":
          return {
            summary: `rankings for ${(rr.rankings ?? []).length} assumptions`,
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

  // Item 14: copy the full run (inputs and outputs per agent) to the clipboard.
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
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-stone-600">That decision doesn't exist.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-medium text-stone-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const assumptions = assumptionsByDecision(id);
  const evidence = evidenceByDecision(id);
  if (assumptions.length === 0 || evidence.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-stone-600">
          This decision needs at least one assumption and one evidence snippet
          before a review can run.
        </p>
        <Link
          to={`/decision/${id}`}
          className="mt-3 inline-block text-sm font-medium text-stone-900 underline"
        >
          Back to decision
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={`/decision/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
        ← {decision.title || "Decision"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-stone-900">Running review</h1>
      <p className="mt-1 text-sm text-stone-500">
        Four specialist agents run in sequence. Each card shows the real JSON it
        returned: the typed handoff to the next agent.
      </p>

      <ol className="mt-6 space-y-4">
        {steps.map((step, i) => (
          <li key={step.agent} className="relative">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <StatusIcon status={step.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-900">
                      {i + 1}. {step.name}
                    </span>
                    {step.status === "done" && step.durationMs > 0 && (
                      <span className="text-xs text-stone-400">
                        {(step.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">{step.role}</p>
                  {step.inputSummary && (
                    <p className="mt-1 text-xs text-stone-400">
                      Input: {step.inputSummary}
                    </p>
                  )}
                  {step.output && <JsonView value={step.output} />}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <p className="font-medium">The pipeline stopped</p>
          <p className="mt-1 text-rose-600">{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => navigate(0)}
              className="rounded-md bg-white px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
            >
              Start over
            </button>
            <Link
              to={`/decision/${id}`}
              className="rounded-md px-3 py-1 text-xs font-medium text-stone-500 hover:text-stone-700"
            >
              Back to decision
            </Link>
          </div>
        </div>
      )}

      {done && runId && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to={`/decision/${id}/report/${runId}`}
            className="inline-flex items-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            View report
          </Link>
          <button
            type="button"
            onClick={copyRunJson}
            className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            {copied ? "Copied ✓" : "Copy run JSON"}
          </button>
          <span className="text-sm text-stone-500">All four agents finished.</span>
        </div>
      )}
    </div>
  );
}
