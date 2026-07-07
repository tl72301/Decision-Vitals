# Decision Vitals

Vital signs for the decisions you've already made.

Decision Vitals is a lightweight, multi-agent implementation of
Assumption-Based Planning (a RAND methodology). You register a business
decision, the system extracts the assumptions underneath it, you paste in
evidence as it accumulates, and a pipeline of specialist agents reviews the
assumptions and produces a versioned Decision Health Report: a grade,
per-assumption verdicts with quoted evidence receipts, the strongest
disconfirming case, and concrete shaping and hedging actions.

See `PLAN.md` for the full product spec and `/about` on the deployed site for
the case study.

## Architecture

- **Frontend:** Vite + React + Tailwind, client-side routing (React Router).
  State lives in `localStorage` under one key; sample data is a static JSON
  file. There is no database.
- **Agents:** six specialist agents on Claude Managed Agents, each a named,
  versioned agent definition (model, system prompt, no tools). Judgment-heavy
  roles (Challenge, Reporter) run on a Sonnet-class model; the other four run
  on Haiku. Definitions live in `agents.json`.
- **Orchestration:** the app drives a deterministic sequential pipeline with
  typed JSON contracts. Each agent's output schema is the next agent's input.
  Deterministic rules override model judgment where it matters: a
  load-bearing assumption with strong contradicting evidence can never be
  "holding", and the health grade derives mechanically from statuses.
- **Serverless routes (Vercel, under `/api`):**
  - `api/setup.js`: idempotently creates or updates the six agents from
    `agents.json` (matched by name) and returns their IDs.
  - `api/agent.js`: `POST { agent, payload }` runs one specialist as a
    Managed Agents session, polls until idle, parses the JSON reply (one
    retry with a "JSON only" nudge), and returns it.
  - `api/live.js`: verifies the Live Mode passphrase.
- **Modes:** the app defaults to Demo Mode, which replays recorded real agent
  runs from `src/data/recordedRuns.json` with staged delays and zero API
  calls, under a visible label. Live Mode runs real sessions and is gated by
  a passphrase that `api/agent.js` re-checks on every call.

### Agent pipeline

Registration (Phase A): Intake extracts a title, a normalized statement, and
3 to 5 candidate assumptions; Classifier tiers each assumption (load-bearing,
vulnerable, lower-risk) and writes a signpost.

Review (Phase B): Evidence Review maps snippets to assumptions with direction
and strength; Challenge argues the strongest honest case against every
assumption; Risk Ranking assigns statuses under the hard rules; Reporter
writes the health report. Every step's real JSON input and output is visible
in the Agent Run view, and every run is traceable as a session in the Claude
Console.

## Routes

| Path                          | Screen                 |
| ----------------------------- | ---------------------- |
| `/`                           | Dashboard              |
| `/new`                        | New Decision           |
| `/decision/:id`               | Decision Detail        |
| `/decision/:id/run`           | Agent Run view         |
| `/decision/:id/report/:runId` | Decision Health Report |
| `/about`                      | Case study             |

## Setup

1. Deploy the repo on Vercel (auto-detected as Vite; `vercel.json` provides
   the SPA rewrite so deep links survive refresh).
2. Set two environment variables in Vercel (Production scope):
   - `ANTHROPIC_API_KEY`: your Claude API key. Read only in `/api`; it never
     reaches the browser.
   - `LIVE_MODE_PASSPHRASE`: any secret phrase. Required to unlock Live Mode;
     without it set, Live Mode is not gated.
3. Visit `/api/setup` once. It registers the six agents and returns their
   IDs; the agents appear in the Claude Console. Repeat calls are no-ops.
4. To edit a prompt: change `agents.json`, push, and hit `/api/setup` again.

## Development

Everything is built through Claude Code on the web and deployed by pushing to
`main` (Vercel auto-deploys). Standard scripts exist for verification:

```bash
npm install
npm run build    # production build
npm run dev      # local dev server (requires vercel dev for the /api routes)
```

## Deliberate scope limits

No auth, no database, no file parsing, no integrations, no streaming, no
agent memory across decisions, and no editing of evidence once a review has
used it (immutable evidence keeps receipts honest). Platform-level
agent-to-agent coordination is a research preview and was skipped on
purpose; app-driven sequencing is simpler and easier to reason about.
