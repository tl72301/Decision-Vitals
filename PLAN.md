Decision Vitals: 5-Day Build Plan

An ABP-inspired multi-agent decision monitoring prototype. Agents run on Claude Managed Agents, code is written by Claude Code on the web, hosting is Vercel via GitHub. Nothing runs on your machine. You direct architecture and verify results.

Name: Decision Vitals. It pairs directly with the product's core output, the Decision Health Report: assumptions are the vital signs, the review is the checkup, and a weakening assumption is a vital trending in the wrong direction. It also explains itself in an interview without you defining any ABP terms first.


1. Final MVP Definition

What it does:


User registers a business decision (statement + context).
An Assumption pipeline extracts 3 to 5 assumptions and labels each as load-bearing, vulnerable, or lower-risk, with a signpost (what to watch) per assumption.
User pastes evidence snippets (meeting notes, tickets, feedback, market updates), each tagged with a source type.
User clicks "Run review." Four agents run in sequence: Evidence Review, Challenge, Risk Ranking, Reporter. Each agent's real input and output is visible in the UI as it runs.
Output: a Decision Health Report showing per-assumption status (holding / weakened / invalidated / needs review), evidence receipts (which snippet drove which verdict), an overall health grade, and recommended shaping and hedging actions.
User can add more evidence later and re-run. Reports version (Review #1, Review #2), which is the honest lightweight version of "continuous monitoring."
Ships with 3 preloaded sample decisions so the demo works instantly.


What it does NOT do:


No login, no accounts, no multi-user.
No automatic evidence ingestion (no email, Slack, or ticket integrations).
No file upload parsing. Paste text only.
No database. localStorage plus a JSON file of sample data.
No agent-to-agent coordination or autonomous orchestration. Six hosted specialist agents on Claude Managed Agents run in a deterministic sequence driven by the app, and you say so openly.
No charts beyond simple status indicators.



2. Recommended Tech Stack

Use: Vite + React + Tailwind frontend hosted on Vercel via GitHub. All agent reasoning on Claude Managed Agents. All code written by Claude Code on the web. Zero local installs.

Why each choice:


Vite + React, not Next.js. One page-app with client-side routing. Next.js adds concepts you do not need in a 5-day build. The only server-side pieces you need are two small Vercel serverless routes.
No Supabase, no database. Decisions live in localStorage. Sample data lives in a static JSON file. A database adds setup time and zero demo value.
Claude Managed Agents for the six specialists. Each agent is a real, named agent definition on the Claude Platform (model, system prompt, no tools since they only transform provided text), created once and referenced by ID. Every run produces a session trace in the Claude Console, which doubles as portfolio evidence. Managed Agents is in beta and requires the managed-agents-2026-04-01 beta header (SDKs set it automatically). Claude Code must read the docs before implementing: https://platform.claude.com/docs/en/managed-agents/overview and the quickstart, and verify current model strings there rather than guessing. Use a Sonnet-class model for Challenge and Reporter (judgment-heavy) and a Haiku-class model for the other four (structured extraction).
Two serverless routes on Vercel, no other backend. /api/setup reads agents.json from the repo and idempotently creates or updates the six agent definitions via the Managed Agents API, returning their IDs. /api/agent accepts { agent, payload }, runs a Managed Agents session for that specialist, waits until the session goes idle, and returns the parsed JSON output. The API key lives in a Vercel environment variable and never reaches the browser.
Skip research-preview features. Multi-agent coordination and dreaming are access-gated previews. App-driven sequencing is simpler, not gated, and easier to defend.
Cost: standard token rates plus $0.08 per active session-hour, billed per active runtime. These runs last seconds each; total build cost is trivial. Demo Mode keeps the public site at zero.
Demo mode toggle. The hosted version defaults to Demo Mode: recorded real agent runs replayed with realistic delays and a visible "Demo mode: replaying recorded agent runs" label. Live Mode runs real sessions and is gated behind a passphrase (env var) so strangers cannot spend your credits. This is honest as long as the UI labels it.



3. Exact Screens to Build

Screen 1: Dashboard (/)


App name, one-line tagline ("Vital signs for the decisions you've already made").
Decision cards: title, date, health grade badge, count of assumptions by status.
"New decision" button. "Load sample decisions" button (visible when empty).


Screen 2: New Decision (/new)


Decision statement (textarea).
Context (textarea, optional): what prompted it, constraints, stakeholders.
Decision owner and date (text inputs, optional).
"Extract assumptions" button → runs Intake + Classifier agents with a visible progress state → routes to Screen 3.


Screen 3: Decision Detail (/decision/:id) — the main screen, three sections:


Assumptions panel: each assumption as a card with label chip (load-bearing / vulnerable / lower-risk), signpost text, current status chip, and inline edit (user can reword or delete an assumption before first review; this shows human-in-the-loop judgment).
Evidence inbox: paste box + source-type select (meeting notes, customer feedback, support ticket, market update, status update) + date. List of added snippets below.
"Run review" button → opens the Agent Run view.


Screen 4: Agent Run view (modal or route /decision/:id/run)


Vertical pipeline of agent cards: Evidence Review → Challenge → Risk Ranking → Reporter.
Each card: agent name, one-line role description, spinner while running, then a collapsible "view output" showing the actual JSON returned. This is what proves multi-agent architecture; do not skip it.
When done: "View report" button.


Screen 5: Decision Health Report (/decision/:id/report/:runId)


Header: decision statement, overall health grade (Healthy / Watch / At Risk), review number and date.
Per-assumption rows: status, one-sentence rationale, evidence receipts (quoted snippet fragments with source type).
Challenge findings: the strongest disconfirming evidence found, even for "holding" assumptions.
Next actions: shaping actions (strengthen the assumption) and hedging actions (prepare for it failing), 2 to 4 total, each tied to a named assumption.
Version switcher if multiple reviews exist.



4. Exact Data Model

All stored in localStorage under one key (decision_vitals_state). Shapes:

Decision {
  id: string
  title: string            // short label, generated by Intake agent
  statement: string        // user input
  context: string
  owner: string
  createdAt: ISO string
  healthGrade: "healthy" | "watch" | "at_risk" | null
}

Assumption {
  id: string
  decisionId: string
  text: string
  loadBearing: boolean
  vulnerable: boolean
  tier: "load_bearing" | "vulnerable" | "lower_risk"   // derived label for UI
  signpost: string         // what observable signal would indicate this is failing
  status: "untested" | "holding" | "weakened" | "invalidated" | "needs_review"
  userEdited: boolean
}

Evidence {
  id: string
  decisionId: string
  text: string
  sourceType: "meeting_notes" | "customer_feedback" | "support_ticket" | "market_update" | "status_update"
  date: string
  addedAt: ISO string
}

AgentRun {
  id: string
  decisionId: string
  runNumber: number
  startedAt: ISO string
  steps: [{ agent: string, status: "pending" | "running" | "done" | "error",
            inputSummary: string, output: object, durationMs: number }]
}

Report {
  id: string
  decisionId: string
  runId: string
  runNumber: number
  createdAt: ISO string
  healthGrade: "healthy" | "watch" | "at_risk"
  summary: string          // 2-3 sentences
  findings: [{ assumptionId: string, status: string, rationale: string,
               receipts: [{ evidenceId: string, quote: string }] }]
  challengeHighlights: [string]
  actions: [{ type: "shaping" | "hedging", assumptionId: string, text: string }]
}


5. Exact Agent Workflow

Phase A: on decision submit


Decision Intake Agent — input: raw statement + context. Output: cleaned decision title, normalized statement, list of 3 to 5 candidate assumptions (text only).
Assumption Classifier Agent — input: decision + candidate assumptions. Output: per assumption: loadBearing (would the decision collapse if false?), vulnerable (plausibly false within the decision's horizon?), tier, and one signpost.
UI shows assumptions. User edits/confirms. Nothing else runs until evidence exists.


Phase B: on "Run review" (requires ≥1 evidence snippet)
4. Evidence Review Agent — input: assumptions + all evidence. Output: per evidence item: which assumptions it touches, direction (supports / contradicts / neutral), strength (weak / moderate / strong), one-line reading.
5. Challenge Agent — input: assumptions + Evidence Review output. Output: for each assumption, the single strongest case that it is wrong, citing evidence where it exists and flagging "no disconfirming evidence found, but here is the untested risk" where it does not.
6. Risk Ranking Agent — input: Classifier tiers + Evidence Review + Challenge output. Output: per assumption: status (holding / weakened / invalidated / needs_review), confidence (low/med/high), rationale referencing evidence IDs. Rule it must follow: load-bearing + any strong contradicting evidence can never be "holding."
7. Reporter Agent — input: everything above. Output: full Report object — summary, health grade (derived: any invalidated load-bearing assumption = at_risk; any weakened load-bearing or invalidated vulnerable = watch; else healthy), receipts, 2 to 4 shaping/hedging actions.

Each step: one Managed Agents session run through /api/agent, strict JSON out, validated before the next step runs. The app owns sequencing; Managed Agents owns execution. If JSON parsing fails, retry once with an appended "Return only valid JSON" instruction, then surface an error card.


6. Exact Prompts for Each Agent

Store these in agents.json in the repo as each specialist's system prompt; /api/setup pushes them to the Managed Agents API. A prompt edit is: change agents.json, push, hit /api/setup once. Every prompt ends with the same guardrail block:


Return ONLY valid JSON matching the schema. No markdown, no preamble, no code fences. If information is missing, use null rather than inventing facts. Never fabricate evidence.



Decision Intake Agent (system prompt):

You are the Decision Intake Agent in Decision Vitals, an assumption-based
decision monitoring tool. Given a business decision statement and optional
context, you: (1) write a short title (max 8 words), (2) restate the
decision as one clear sentence, (3) extract the 3 to 5 most important
assumptions the decision depends on. Assumptions must be falsifiable
statements about the world, not restatements of the decision. Prefer
assumptions about customers, market, capacity, timing, and dependencies.

Schema: { "title": string, "statement": string, "assumptions": [string] }

Assumption Classifier Agent:

You are the Assumption Classifier Agent. You apply Assumption-Based
Planning. For each assumption, assess: loadBearing — if this assumption
is false, does the decision fail or require major rework? vulnerable —
within the plausible horizon of this decision, could events realistically
make it false? Then assign tier: load_bearing if loadBearing is true,
else vulnerable if vulnerable is true, else lower_risk. Write one
signpost per assumption: a concrete, observable signal that would
indicate the assumption is failing.

Schema: { "assumptions": [{ "text": string, "loadBearing": boolean,
"vulnerable": boolean, "tier": string, "signpost": string }] }

Evidence Review Agent:

You are the Evidence Review Agent. Given a decision, its assumptions
(with IDs), and evidence snippets (with IDs), map each evidence item to
the assumptions it bears on. For each mapping give: direction (supports,
contradicts, neutral), strength (weak, moderate, strong), and a one-line
reading. Strength reflects specificity and reliability of the snippet,
not how alarming it sounds. An item may map to multiple assumptions or
none.

Schema: { "mappings": [{ "evidenceId": string, "assumptionId": string,
"direction": string, "strength": string, "reading": string }] }

Challenge Agent:

You are the Challenge Agent. Your only job is to argue against each
assumption. For each assumption, build the strongest honest case that it
is wrong, citing evidence IDs where contradicting evidence exists. Where
none exists, say so explicitly and state the most important untested risk
instead. Do not soften. Do not manufacture evidence. A challenge with no
evidentiary basis must be labeled "untested_risk", one grounded in
evidence must be labeled "evidenced".

Schema: { "challenges": [{ "assumptionId": string, "type": "evidenced" |
"untested_risk", "case": string, "evidenceIds": [string] }] }

Risk Ranking Agent:

You are the Risk Ranking Agent. Given assumption tiers, evidence
mappings, and challenge cases, assign each assumption a status: holding
(evidence supports or nothing credible contradicts), weakened (credible
contradicting evidence, not conclusive), invalidated (strong
contradicting evidence outweighs support), needs_review (conflicting or
insufficient evidence on a load-bearing assumption). Hard rule: an
assumption with tier load_bearing and any strong contradicting mapping
cannot be "holding". Give confidence (low/medium/high) and a rationale
citing evidence IDs.

Schema: { "rankings": [{ "assumptionId": string, "status": string,
"confidence": string, "rationale": string, "evidenceIds": [string] }] }

Reporter Agent:

You are the Reporter Agent. Produce a Decision Health Report for a
business audience: direct, specific, no filler. Inputs: decision,
assumptions with tiers and statuses, evidence mappings, challenge cases,
risk rankings. Output: (1) healthGrade using these rules: at_risk if any
load_bearing assumption is invalidated; watch if any load_bearing
assumption is weakened or needs_review, or any assumption is invalidated;
otherwise healthy. (2) A 2 to 3 sentence summary naming the decision and
the single most important finding. (3) Per-assumption findings with
receipts: short verbatim quotes (under 15 words) from evidence with
their IDs. (4) 2 to 4 next actions, each labeled shaping (strengthens an
assumption) or hedging (prepares for its failure), each tied to one
assumptionId, each concrete enough to assign to a person.

Schema: { "healthGrade": string, "summary": string, "findings": [...],
"challengeHighlights": [string], "actions": [...] }


7. How to Present the Multi-Agent Architecture Honestly

You are no longer simulating anything. The defensible pattern:


Six real, named agents on Claude Managed Agents. Each specialist is its own agent definition (name, model, system prompt) on the Claude Platform, created once and referenced by ID. Every run produces a session trace in the Claude Console. Screenshot the agent list and one full session trace for the case study; that is architecture evidence most portfolio projects cannot show.
App-driven sequential pipeline with typed JSON contracts. The frontend orchestrates the order; each agent's output schema is the next agent's input contract. You designed the contracts, the sequencing, and the override rules (like the load-bearing hard rule). The determinism is deliberate.
No research-preview features. Multi-agent coordination and dreaming are access-gated previews; skip them. Framing: "I kept orchestration deterministic in the application layer; platform-level agent-to-agent coordination is the obvious next step, and it is on the roadmap."
Visible agent cards with real I/O, exactly as specced in Screen 4. Nothing mocked in Live Mode.
Demo mode = recorded runs, labeled. Replays of real session outputs with a visible "Demo mode" label. Recorded, not faked.
How to phrase it: "Six managed specialist agents with typed JSON handoffs, deterministic sequencing, and console-traceable sessions on Claude Managed Agents." Do not say autonomous, swarm, or self-orchestrating. Interviewers who know the space will probe, and the accurate version sounds better anyway.



8. Day-by-Day Build Plan

Day 1 — Skeleton, agents, intake


Files: Vite project, Tailwind config, src/lib/store.js (localStorage state), object shapes documented as JSDoc, router with 5 routes, agents.json (six agent definitions with system prompts), api/setup.js, api/agent.js.
Components: AppShell, Dashboard (empty state), NewDecision form.
Logic: state read/write, decision creation, agent registration route, session-running route, JSON validation helper with one retry.
Copy: app name, tagline, empty-state text.
Test before moving on: hit /api/setup on the deployed URL and confirm six agents appear in the Claude Console; submit a decision on the live site, see 3 to 5 assumptions returned and persisted across a page reload.


Day 2 — Assumptions and evidence


Components: AssumptionCard (tier chip, signpost, status chip, inline edit/delete), EvidencePanel (paste box, source select, list).
Logic: Classifier agent call chained after Intake; evidence CRUD in localStorage.
Copy: tier chip labels and tooltips explaining load-bearing vs vulnerable (this is where ABP literacy shows).
Test: full Phase A works; you can edit an assumption; evidence saves and lists correctly.


Day 3 — The review pipeline


Components: AgentRunView with four sequenced agent cards, collapsible JSON output.
Logic: sequential calls for Evidence Review → Challenge → Risk Ranking → Reporter; each step's output stored in AgentRun; Report object built and saved; assumption statuses and decision healthGrade updated from the report.
Test: run a review end to end on one sample decision; verify the load-bearing hard rule fires when you feed it strong contradicting evidence; verify a re-run creates Review #2.


Day 4 — Report page, samples, demo mode


Components: ReportView (grade header, findings rows with receipts, challenge highlights, actions), version switcher.
Logic: sample data loader from src/data/samples.json; run real reviews on all 3 samples, capture the JSON, wire Demo Mode replay with 800 to 1500ms staged delays; Demo/Live toggle.
Copy: report section headings, demo mode disclosure line.
Test: fresh browser, load samples, run a review in demo mode with no API key present; everything renders.


Day 5 — Polish, deploy, case study


Logic: error states (API failure card, JSON retry), empty states, mobile pass.
Production checks: the site is already live via GitHub auto-deploys. Confirm the env vars are set in Vercel, demo mode defaults ON in production, Live Mode is passphrase-gated, and the API key is only read server-side.
Copy: About page with the portfolio case study (Section 12), footer link to the ABP inspiration.
Record the walkthrough video (Section 11).
Test: full demo script on the deployed URL, on your phone.



9. Claude Code Checklist

Give Claude Code (on the web) these prompts in order. One prompt, verify on the deployed URL, then the next.


"Read PLAN.md in this repo. Then read the Claude Managed Agents overview and quickstart at https://platform.claude.com/docs/en/managed-agents/overview before writing any code. Summarize back: how agents are created, how sessions run and go idle, how to extract a final structured output from a session, and the current recommended model strings."
"Create a Vite + React + Tailwind project with React Router and these routes: /, /new, /decision/:id, /decision/:id/run, /decision/:id/report/:runId. Add a Vercel-compatible /api folder. Push when done."
"Create src/lib/store.js: a localStorage-backed store under key 'decision_vitals_state' with CRUD helpers for decisions, assumptions, evidence, agentRuns, and reports, using the exact object shapes in PLAN.md Section 4."
"Create agents.json defining the six specialists per PLAN.md Sections 2 and 6: name, model class, system prompt, and no tools, since they only transform provided text. Then create api/setup.js: an idempotent serverless route that creates or updates these six agents via the Managed Agents API using the ANTHROPIC_API_KEY env var and returns their IDs."
"Create api/agent.js: accepts POST { agent, payload }, runs a Managed Agents session for that specialist with the payload as the message, waits until the session goes idle, extracts and parses the JSON result, retries once on a parse failure, and returns it. The API key must never reach the browser."
"Build the Dashboard screen per PLAN.md Screen 1."
"Build the New Decision screen per PLAN.md Screen 2. On submit, run the intake agent then the classifier agent through /api/agent with a visible progress state, save results, and route to the decision detail page."
"Build the Decision Detail screen per PLAN.md Screen 3. Assumption cards must support inline edit and delete before the first review."
"Build the Agent Run view per PLAN.md Screen 4. Run evidence_review, challenge, risk_ranking, reporter sequentially through /api/agent, updating each card's status live, and store everything in an AgentRun object."
"Implement report generation: build the Report object from the reporter output, update assumption statuses and the decision healthGrade, and support multiple numbered reviews per decision."
"Build the Report screen per PLAN.md Screen 5."
"Create src/data/samples.json with the 3 sample decisions and evidence from PLAN.md Section 10."
"Add Demo Mode: a recorded-runs JSON file, a replay engine with staged 800 to 1500ms delays, a visible 'Demo mode: replaying recorded agent runs' label, and a Demo/Live toggle. Demo Mode must work with zero API calls. Gate Live Mode behind a passphrase checked server-side against a LIVE_MODE_PASSPHRASE env var."
"Add a 'Copy run JSON' button to the Agent Run view that copies the full run, inputs and outputs, to the clipboard."
(You do this one.) Run a live review on each of the 3 samples on the deployed site, click Copy run JSON each time, and paste each back to Claude Code: "Add this captured run to the recorded-runs file for sample N."
"Add error and empty states everywhere: pipeline failure card, empty dashboard, decision with no evidence."
"Do a design polish pass: consistent spacing, chip colors by tier and status, readable report typography, mobile layout."
"Add an About page with this case study copy: [paste Section 12 content once written]."
"Production readiness: demo mode defaults to on in production, confirm the API key and passphrase are only read server-side, and write a README covering the architecture and setup."



10. Sample Demo Data

Sample 1 — SaaS pricing decision
Decision: "Migrate our B2B SaaS product from per-seat pricing to usage-based billing in Q4."
Context: Flat NRR, sales says seats are capping deal sizes, two competitors moved to usage-based this year.
Evidence snippets:


(customer_feedback) "Renewal call with Meridian: CFO said per-seat is the only pricing model their procurement will approve this fiscal year. Usage-based would push renewal to committee."
(market_update) "Competitor B walked back part of its usage pricing after churn in mid-market accounts, reintroducing a seat-based floor."
(status_update) "Billing team estimates metering infrastructure at 9 weeks, not the 5 in the original plan. Two dependencies on the platform team."
(meeting_notes) "Sales pipeline review: 3 of 7 late-stage deals asked about usage pricing unprompted. AEs believe it would have expanded 2 of them."


Sample 2 — Fulfillment outsourcing decision
Decision: "Move e-commerce fulfillment from our in-house warehouse to a third-party logistics provider (3PL) by Q2."
Context: Order volume up 60 percent year over year; warehouse lease renewal due in 8 months; 3PL quotes suggest 18 percent cost savings at current volume.
Evidence snippets:


(status_update) "3PL pilot, week 3: 94 percent of orders shipped same-day vs our 97 percent in-house. Two mispicks on bundled SKUs, both traced to our product data feed."
(customer_feedback) "Post-purchase survey trend: 'fast shipping' mentions in 5-star reviews dropped from 31 percent to 24 percent during the pilot region rollout."
(market_update) "The 3PL announced acquisition by a larger logistics group; two of their mid-size clients publicly flagged onboarding freezes during the transition."
(meeting_notes) "Ops review: 3PL pricing assumes our current SKU count. Planned Q3 product line expansion adds 40 SKUs, which triggers their next pricing tier."


Sample 3 — Market expansion decision
Decision: "Launch a self-serve tier in January to expand from enterprise into mid-market without growing the sales team."
Context: CAC on enterprise deals rising; board wants efficient growth; product currently requires white-glove onboarding.
Evidence snippets:


(market_update) "Industry report: mid-market buyers in this category still convert 3x better with sales-assisted trials than pure self-serve."
(customer_feedback) "Trial exit survey, n=41: top drop-off reason was 'couldn't connect our data without help' (58 percent)."
(status_update) "Onboarding automation project is 70 percent complete; the remaining 30 percent covers exactly the data-connection step."
(meeting_notes) "Support lead: current ticket volume per customer would make self-serve unprofitable below $400/mo unless deflection improves."



11. Final Demo Script (2.5 to 3 minutes)


Cold open on the report, not the form (20s). Show Sample 2's finished Decision Health Report. "This is Decision Vitals. It watches the assumptions behind a business decision and tells you when they stop holding."
The problem (20s). "Decisions get made once and reviewed never. The assumptions underneath them quietly expire. This is Assumption-Based Planning, a RAND methodology, made light enough to actually use."
Register a decision (30s). Enter Sample 1's decision live. Show the extracted assumptions and the tier labels. Explain load-bearing vs vulnerable in one sentence each.
Add evidence (20s). Paste two snippets. "No integrations, no setup. Meeting notes, tickets, whatever you have."
Run the pipeline (45s). The centerpiece. Narrate each agent card as it completes: "Evidence Review maps snippets to assumptions. The Challenge agent argues against every assumption, even healthy ones. Risk Ranking applies the rules, including a hard rule that a load-bearing assumption with strong contradicting evidence can never be marked holding. The Reporter writes it up." Open one JSON output to show the typed handoff, then cut briefly to the Claude Console session trace for the same run.
The report (30s). Point at one weakened assumption, its evidence receipt, and one hedging action. "Every verdict has a receipt. Every action names the assumption it protects."
Close (15s). "Six specialist agents running on Claude Managed Agents, typed JSON contracts, deterministic escalation rules. I designed the architecture and the contracts; Claude Code implemented it; the agents run on Anthropic's platform. Case study linked below."



12. Portfolio Case Study Outline


Problem. Decisions are monitored by vibes. Assumptions expire silently; reviews happen after the damage.
Inspiration: Assumption-Based Planning. One paragraph on ABP (RAND): load-bearing assumptions, vulnerable assumptions, signposts, shaping actions, hedging actions. Why it rarely gets used: too heavy. Your thesis: agents make it continuous and cheap.
Solution. What Decision Vitals does in 4 sentences, with a screenshot of the report.
Agent architecture. Pipeline diagram of the six Managed Agents, the JSON contracts between them, and the deterministic rules layered on top of model judgment (the load-bearing hard rule, the health grade derivation). Include Claude Console screenshots: the agent list and one session trace. State plainly: hosted specialist agents on Claude Managed Agents with app-driven deterministic sequencing; you skipped the platform's research-preview agent-to-agent coordination on purpose, and explain why.
Product decisions. Why paste-only evidence (adoption over integration). Why user-editable assumptions (human-in-the-loop before machine review). Why versioned reviews instead of background monitoring. Why demo mode (reliability of the public demo).
Limitations. Evidence quality is user-dependent. No source weighting. Single-decision scope; no cross-decision dependency tracking. Model judgment on strength/direction is not calibrated.
What I would build next. Scheduled evidence pulls from one source (e.g., a project tool), assumption dependency links across decisions, and signpost alerting. Note that cross-decision propagation is the follow-on project.



13. Scope Control: Do Not Build


Auth, accounts, or sharing links.
Any database. If you catch yourself typing "supabase," stop.
File upload with parsing (PDF/docx evidence). Paste only.
Email, Slack, Jira, or calendar integrations.
Streaming token-by-token output. Card-level status updates are enough.
Agent memory across decisions.
Charts, dashboards, or trend lines beyond status chips and the grade badge.
A settings page. Demo/Live toggle in the header is the only setting.
More than 3 sample decisions.
A local dev environment. Everything goes through Claude Code on the web, GitHub, and Vercel deployments.
Research-preview platform features (multi-agent coordination, dreaming). Access-gated and unnecessary at this scale; name them in the roadmap instead.
Editing evidence after a review has used it (immutable evidence keeps receipts honest and saves you a pile of edge cases).



14. Final Build Checklist


 Vite + React + Tailwind scaffold with 5 routes and /api folder
 localStorage store with all 5 object types
 agents.json plus /api/setup and /api/agent routes, six agents visible in the Claude Console
 New Decision → Intake + Classifier working end to end
 Assumption cards with tiers, signposts, inline edit
 Evidence inbox with source types
 Sequential 4-agent review pipeline with live agent cards and visible JSON
 Report page with grade, receipts, challenge highlights, shaping/hedging actions
 Versioned re-reviews working
 3 samples loaded, real runs recorded, Demo Mode replaying them with labels
 Error and empty states
 Polish pass and mobile check
 Live on Vercel via GitHub auto-deploys, demo mode on by default, Live Mode passphrase-gated, key server-side only
 About page with case study
 Walkthrough video recorded against the deployed URL
 README written
