# Decision Vitals

Vital signs for the decisions you've already made.

**Live demo:** https://decision-vitals.vercel.app (Demo mode replays real
recorded agent runs; no API key needed)

Decision Vitals watches the assumptions a business decision rests on and tells
you when the evidence starts to turn against one. You register a decision and
AI agents pull out the assumptions underneath it, marking which are
**critical** (the decision could break if they're wrong) and which are
**supporting**, each with a **warning signal** to watch for. You paste in
evidence as it accumulates: meeting notes, tickets, customer feedback, market
updates. When you review the decision, four specialist agents map the evidence
to each assumption, argue against every one of them, grade where each stands,
and write a Decision Health Report with an overall grade, a verdict per
assumption backed by quoted evidence, and concrete next steps. Reviews are
numbered, so a decision builds a health history.

Inspired by RAND's Assumption-Based Planning; see `/about` on the site for the
full case study.

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
  Deterministic rules override model judgment where it matters: a critical
  assumption with strong contradicting evidence can never be graded as still
  holding, and the overall health grade is computed from the per-assumption
  verdicts rather than left to the model.
- **Serverless routes (Vercel, under `/api`):**
  - `api/setup.js`: idempotently creates or updates the six agents from
    `agents.json` (matched by name) and returns their IDs.
  - `api/agent.js`: `POST { agent, payload }` runs one specialist as a
    Managed Agents session, polls until idle, parses the JSON reply (one
    retry with a "JSON only" nudge), and returns it.
  - `api/live.js`: verifies the Live Mode passphrase.
  - `api/og.js`: renders the Open Graph card for link previews (Edge runtime).
- **Modes:** the app defaults to Demo Mode, which replays recorded real agent
  runs from `src/data/recordedRuns.json` with staged delays and zero API
  calls, under a visible label. Live Mode runs real sessions and is gated by
  a passphrase that `api/agent.js` re-checks on every call.

### Agent pipeline

Registration: Intake extracts a title, a normalized statement, and 3 to 5
candidate assumptions; Classifier marks each critical or supporting and writes
its warning signal.

Review: Evidence Review maps evidence to assumptions with direction and
strength; Challenge argues the strongest honest case against every assumption;
Risk Ranking grades each one under the review rules; Reporter writes the
health report. Every step's real JSON input and output is visible in the
review view, and every run is traceable as a session in the Claude Console.

## MCP server

Decision Vitals is also an MCP server, so Claude (or any MCP client) can work
with your decisions from a conversation: list them, inspect their assumptions,
and file new evidence ("just got off a call with Meridian, log this against
the pricing decision"). Evidence filed by an agent appears in the app within
about 20 seconds while it is open in Live Mode, ready for a re-review.

Tools: `list_decisions`, `get_decision`, `add_evidence`.

How it works: decisions live in the browser's localStorage, so the app (Live
Mode only) syncs a snapshot to a small Redis store via `/api/sync` and pulls
back any evidence agents filed. `api/mcp.js` serves the MCP Streamable HTTP
endpoint (stateless, JSON responses) against that store, protected by the same
passphrase as Live Mode.

Setup:

1. In Vercel, add the **Upstash for Redis** marketplace integration to the
   project (free tier is fine); the `KV_REST_API_*` env vars are injected
   automatically. Redeploy.
2. Open the app in Live Mode once so it syncs your decisions.
3. In Claude: Settings, Connectors, Add custom connector, with URL
   `https://<your-site>/api/mcp?key=<LIVE_MODE_PASSPHRASE>`.

## Pull evidence from Gmail

A decision's evidence often arrives as email. Label those emails
`decision-evidence` in Gmail, and the **Pull from Gmail** button on a decision
(Live Mode) files them as evidence, ready for a re-review. It connects once to
the owner's own mailbox with a read-only refresh token, reads only labeled
messages, trims quoted reply chains, and pulls each email at most once (already
seen message IDs are remembered in Redis).

Setup:

1. In the **Google Cloud Console**, create an OAuth **Web application** client.
   Add the authorized redirect URI `https://<your-site>/api/gmail-auth`. Put
   its ID and secret in Vercel as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then redeploy.
2. Visit `https://<your-site>/api/gmail-auth?key=<LIVE_MODE_PASSPHRASE>` once,
   consent with your own Google account, and copy the printed refresh token
   into Vercel as `GOOGLE_REFRESH_TOKEN`. Redeploy.
3. Label the emails you want ingested `decision-evidence` (override with
   `GMAIL_LABEL`), open a decision in Live Mode, and click **Pull from Gmail**.

Requires the same Upstash Redis store as the MCP server (to remember which
emails were already pulled).

## Routes

| Path                          | Screen                 |
| ----------------------------- | ---------------------- |
| `/`                           | Dashboard              |
| `/new`                        | New Decision           |
| `/decision/:id`               | Decision Detail        |
| `/decision/:id/run`           | Review pipeline        |
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
   - Optional: `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash Redis) to
     enable the MCP server and Gmail pull; `GOOGLE_CLIENT_ID` /
     `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` for Gmail pull.
3. Visit `/api/setup` once. It registers the six agents and returns their
   IDs; the agents appear in the Claude Console. Repeat calls are no-ops.
4. To edit a prompt: change `agents.json`, push, and hit `/api/setup` again.

## Development

Built entirely through Claude Code on the web and deployed by pushing to
`main` (Vercel auto-deploys). Standard scripts exist for verification:

```bash
npm install
npm run build    # production build
npm run dev      # local dev server (requires vercel dev for the /api routes)
```

## Deliberate scope limits

No auth, no database, no file parsing, no integrations (yet), no streaming,
no agent memory across decisions, and no editing of evidence once a review
has used it (an unchanging evidence trail keeps the receipts honest).
Platform-level agent-to-agent coordination is a research preview and was
skipped on purpose; app-driven sequencing is simpler and easier to reason
about.
