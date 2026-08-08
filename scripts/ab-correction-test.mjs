// A/B test: does a human correction actually change the analysis?
//
// Runs review stages 3 to 6 twice against the same decision and the same
// evidence, changing exactly one thing: assumption A1's importance.
//
//   Run A (control):   A1 = load_bearing  ("Critical")
//   Run B (corrected): A1 = vulnerable    ("Supporting")
//
// Everything else is byte-identical, so any difference in Challenge, Risk
// Ranking or Reporter output is attributable to the correction alone.
//
// This spends real credits: 8 Managed Agents sessions (4 stages x 2 runs).
//
// Usage:
//   DV_URL=https://decision-vitals.vercel.app \
//   DV_PASSPHRASE='your-live-passphrase' \
//   node scripts/ab-correction-test.mjs
//
// Writes ab-run-control.json and ab-run-corrected.json next to the script and
// prints a side-by-side summary.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.DV_URL || "").replace(/\/$/, "");
const PASS = process.env.DV_PASSPHRASE || "";
const DECISION_ID = process.env.DV_DECISION || "sample-cafe";

if (!BASE || !PASS) {
  console.error("Set DV_URL and DV_PASSPHRASE. See the header of this file.");
  process.exit(1);
}

const samples = JSON.parse(
  readFileSync(join(HERE, "..", "src", "data", "samples.json"), "utf8")
);
const sample = samples.decisions.find((d) => d.id === DECISION_ID);
if (!sample) {
  console.error(`No sample with id ${DECISION_ID}`);
  process.exit(1);
}

// Mirrors the payload construction in src/pages/AgentRun.jsx exactly.
const decisionForAgent = {
  title: sample.title,
  statement: sample.statement,
  context: sample.context,
};
const evidenceForAgent = (sample.evidence ?? []).map((e) => ({
  id: e.id,
  text: e.text,
  sourceType: e.sourceType,
  date: e.date,
}));

function assumptionsFor(corrected) {
  return (sample.assumptions ?? []).map((a, i) => {
    const isA1 = i === 0;
    const tier = corrected && isA1 ? "vulnerable" : a.tier;
    return {
      id: a.id,
      text: a.text,
      tier,
      signpost: a.signpost,
      loadBearing: tier === "load_bearing",
      vulnerable: tier === "vulnerable",
    };
  });
}

async function runAgent(agent, payload) {
  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-live-passphrase": PASS },
    body: JSON.stringify({ agent, payload }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(`${agent} failed (${res.status}): ${data?.error ?? "no body"}`);
  }
  return data.output;
}

async function runPipeline(label, corrected) {
  const assumptions = assumptionsFor(corrected);
  const out = {};
  process.stdout.write(`\n${label}\n`);

  process.stdout.write("  evidence_review … ");
  out.evidence_review = await runAgent("evidence_review", {
    decision: decisionForAgent,
    assumptions,
    evidence: evidenceForAgent,
  });
  process.stdout.write("ok\n");

  process.stdout.write("  challenge … ");
  out.challenge = await runAgent("challenge", {
    decision: decisionForAgent,
    assumptions,
    mappings: out.evidence_review.mappings ?? [],
  });
  process.stdout.write("ok\n");

  process.stdout.write("  risk_ranking … ");
  out.risk_ranking = await runAgent("risk_ranking", {
    assumptions,
    mappings: out.evidence_review.mappings ?? [],
    challenges: out.challenge.challenges ?? [],
  });
  process.stdout.write("ok\n");

  process.stdout.write("  reporter … ");
  out.reporter = await runAgent("reporter", {
    decision: decisionForAgent,
    assumptions,
    evidence: evidenceForAgent,
    mappings: out.evidence_review.mappings ?? [],
    challenges: out.challenge.challenges ?? [],
    rankings: out.risk_ranking.rankings ?? [],
  });
  process.stdout.write("ok\n");

  return { label, corrected, assumptions, outputs: out };
}

const control = await runPipeline("Run A (control): A1 Critical", false);
const fixed = await runPipeline("Run B (corrected): A1 Supporting", true);

writeFileSync(join(HERE, "ab-run-control.json"), JSON.stringify(control, null, 2));
writeFileSync(join(HERE, "ab-run-corrected.json"), JSON.stringify(fixed, null, 2));

// ---- side by side -------------------------------------------------------

const line = (s = "") => console.log(s);
const rule = () => line("-".repeat(78));

const challengesFor = (r) =>
  (r.outputs.challenge.challenges ?? []).map(
    (c) => `${c.assumptionId}: ${(c.text ?? c.challenge ?? "").trim()}`
  );
const rankingsFor = (r) =>
  (r.outputs.risk_ranking.rankings ?? []).map(
    (x) => `${x.assumptionId} -> ${x.status}`
  );

line();
rule();
line("RISK RANKING");
rule();
const rA = rankingsFor(control);
const rB = rankingsFor(fixed);
const maxR = Math.max(rA.length, rB.length);
for (let i = 0; i < maxR; i++) {
  const a = rA[i] ?? "";
  const b = rB[i] ?? "";
  line(`${a === b ? "  " : "* "}${a.padEnd(36)} | ${b}`);
}
line(`\ngrade: ${control.outputs.reporter.healthGrade}  ->  ${fixed.outputs.reporter.healthGrade}`);

rule();
line("CHALLENGE");
rule();
const cA = challengesFor(control);
const cB = challengesFor(fixed);
line(`control: ${cA.length} objections | corrected: ${cB.length} objections`);
const setA = new Set(cA);
const setB = new Set(cB);
const onlyA = cA.filter((x) => !setB.has(x));
const onlyB = cB.filter((x) => !setA.has(x));
line(`\nonly in control (${onlyA.length}):`);
onlyA.forEach((x) => line(`  - ${x}`));
line(`\nonly in corrected (${onlyB.length}):`);
onlyB.forEach((x) => line(`  - ${x}`));

rule();
line("REPORTER SUMMARY");
rule();
line("control:\n" + (control.outputs.reporter.summary ?? ""));
line("\ncorrected:\n" + (fixed.outputs.reporter.summary ?? ""));

rule();
const identical =
  JSON.stringify(control.outputs.risk_ranking) ===
    JSON.stringify(fixed.outputs.risk_ranking) &&
  JSON.stringify(control.outputs.challenge) ===
    JSON.stringify(fixed.outputs.challenge);
line(
  identical
    ? "VERDICT: outputs are byte-identical. The correction changed nothing."
    : "VERDICT: outputs differ. Full JSON written to scripts/ab-run-*.json"
);
rule();
