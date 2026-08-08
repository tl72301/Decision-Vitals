# Phase 0 findings

Discovery only. No application code changed.

Prepared 8 August 2026 against `main` @ `3780fca`.

---

## Headline: Phase 1 is blocked, and it is the only blocked phase

`@modelcontextprotocol/sdk` **1.30.0 is the newest version published to npm**, and it
declares:

```
LATEST_PROTOCOL_VERSION       = '2025-11-25'
SUPPORTED_PROTOCOL_VERSIONS   = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07']
```

`2026-07-28` does not appear anywhere in the SDK. There is no `Mcp-Method` or
`Mcp-Name` header handling and no MRTR result type. The one `input_required`
string in the package is the **Tasks** status enum
(`"working" | "input_required" | "completed" | "failed" | "cancelled"`), not the
stateless-core result type Appendix A describes.

Per the brief's instruction ("If an installed SDK predates 2026-07-28 support,
say so and stop"), **Phase 1 cannot be implemented against a released SDK
today.** Hand-rolling the 2026-07-28 wire format outside the SDK is possible but
would mean maintaining a parallel protocol implementation, which is a poor trade
for a portfolio artifact.

The important consequence: **Phases 2 and 3 do not depend on Phase 1.** Both ship
on the current SDK line. The brief's sequencing assumes otherwise, and that
assumption is the main thing I would change.

| Phase | Status | Why |
| --- | --- | --- |
| 1. Stateless core | **Blocked** | No SDK support for 2026-07-28 |
| 2. Pipeline as Task | **Go** | Tasks types + `simpleTaskInteractive` example ship in SDK 1.30.0 |
| 3. MCP Apps UI | **Go** | `@modelcontextprotocol/ext-apps` 1.7.5, peer-deps `sdk ^1.29.0` (we run ^1.29.0) |
| 4. Memory store | **Go** | Verified against live docs; Appendix A is accurate |
| 5. Portfolio artifacts | Go | Copy only |

---

## 1. Runtime ground truth

**The six agents run on Claude Managed Agents. The MCP SDK is a separate,
unrelated surface.**

Proof, `api/agent.js`:

```
POST {ANTHROPIC_BASE}/v1/sessions                    create a session
POST {ANTHROPIC_BASE}/v1/sessions/{id}/events        send the payload
GET  {ANTHROPIC_BASE}/v1/sessions/{id}               poll until session.status_idle
GET  {ANTHROPIC_BASE}/v1/sessions/{id}/events        read the reply
```

Agent definitions live in `agents.json` and are registered by `api/setup.js`.
The MCP SDK is imported in exactly one file, `api/mcp.js`, which serves the
`/api/mcp` connector endpoint. It never touches the pipeline.

**On the claimed contradiction:** the brief says site copy contradicts itself on
this point. I could not reproduce that on current `main`. `README.md` says
"six specialist agents on Claude Managed Agents" under Architecture and
describes the MCP server in its own section, and `/about` says agents are
"hosted on Claude Managed Agents". Both are correct and consistent. If the
contradiction was observed on the deployed site, it is likely from a cached
build or from a page I have not been pointed at. **I need the specific
location before I "fix" copy that currently reads correctly.**

## 2. Current MCP server shape

`api/mcp.js`, SDK `^1.29.0`:

- Transport: `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`
  and `enableJsonResponse: true`.
- **Already stateless in the sense that matters commercially:** no session id is
  ever issued, no server-side session map, POST-only (405 on anything else), a
  new transport instance is constructed per request.
- **Still handshake-dependent in the protocol sense:** the SDK requires
  `initialize` before `tools/call`, and negotiates `2025-11-25`.
- Auth: `?key=` query param or bearer token, compared against
  `LIVE_MODE_PASSPHRASE`.
- Tools: `list_decisions`, `get_decision`, `add_evidence`.

So the migration cost of Phase 1 is smaller than the brief assumes: there is no
session state to unwind. What is missing is purely the new wire format, which
the SDK does not provide.

## 3. Agent orchestration

**The pipeline runs in the user's browser, not on the server.** This is the most
consequential architectural fact in this report.

- Stages 1 and 2 (Intake, Classifier) run in `src/pages/NewDecision.jsx`.
- Stages 3 to 6 (Evidence Review, Challenge, Risk Ranking, Reporter) run in
  `src/pages/AgentRun.jsx`, in a `for` loop over a `PIPELINE` array.
- Each stage's payload is assembled by `payloadFor(agent)` from the accumulated
  `outputs` object. `/api/agent` is a stateless single-stage proxy: it receives
  `{ agent, payload }`, runs one Managed Agents session, returns JSON.
- `src/lib/review.js` (`buildAndSaveReport`) applies statuses and persists the
  numbered report.

**Idempotency:** every stage is a pure function of its input payload, so any
stage is safely re-runnable. There are no side effects until
`buildAndSaveReport` at the very end. That is unusually favourable for the
re-run requirement in Phase 3b.

**Implication for Phase 2:** wrapping the run in a Task requires moving
orchestration server-side. A browser tab cannot own a task another client polls.
This is real work and it is not mentioned in the brief.

## 4. State and persistence

**There is no Supabase in this project.** The brief references Supabase four
times (Phase 0 item 4, Phase 1 twice, implied in Phase 3b persistence). Zero
matches for `supabase` across `src/` and `api/`.

Actual state:

| Location | Contents | Survives a stateless protocol core? |
| --- | --- | --- |
| Browser `localStorage`, single key `decision_vitals_state` | Decisions, assumptions, evidence, agent runs, reports. **Source of truth.** | Yes, it is client-side |
| Upstash Redis (`api/_kv.js`) | `dv:index` decision snapshot, `dv:inbox` agent-filed evidence, `dv:gmail:processed` | Yes, already external |
| MCP transport session | Nothing | N/A, none is held |
| Serverless process memory | Nothing across requests | N/A |

Nothing in the current design breaks under a stateless core. The one piece of
state a Task would need, run progress, does not exist anywhere durable today.

## 5. The re-run question

**Small change, not a rewrite.** This is the answer that decides the project, and
it is the good answer.

The pipeline does not thread stage-2 output directly into stage 3. The Classifier
persists assumptions into the store, and `AgentRun.jsx` reads assumptions
**from the store** when the review begins. Correcting the classification and
re-running downstream stages is therefore already the app's normal path:
edit assumptions, then "Review decision again".

Two things stand between that and Phase 3b:

1. **The lock.** `DecisionDetail.jsx` sets `locked = reports.length > 0`, freezing
   assumptions after the first review so each report stays traceable to what it
   judged. A correction path must either version assumptions or scope the lock to
   already-reported ones. I recommend versioning: keep the audit property the
   lock was protecting.
2. **Partial re-run.** Today "review again" re-runs all four review stages, not
   3 through 5. Since stages are pure, running the full set is simpler and
   costs one extra Reporter call. I would not build partial re-run.

Estimate: the correction path is days, not weeks. **The five-week risk in this
project is Phase 2's server-side orchestration move, not Phase 3b.**

## 6. Host and SDK support

Fetched successfully: the 2026-07-28 spec announcement, the MCP Apps
announcement, and the Managed Agents memory docs.
**Egress-blocked:** `modelcontextprotocol.io` (the client support matrix itself)
and `claude.com` (the "bringing 2026-07-28 to Claude" post). Support details
below come from the MCP Apps announcement plus search results, not the matrix.

- **MCP Apps:** SEP-1865, extension id `io.modelcontextprotocol/ui`. Tools link a
  UI via `_meta.ui.resourceUri` pointing at a `ui://` resource. `text/html` only,
  sandboxed iframe, JSON-RPC over `postMessage`. Clients include Claude (web and
  desktop), VS Code Copilot, Goose, ChatGPT.
- **Package:** `@modelcontextprotocol/ext-apps` 1.7.5, peer-deps
  `@modelcontextprotocol/sdk ^1.29.0`, `zod ^3.25 || ^4.0`. We are on sdk
  `^1.29.0` and `zod ^4.4.3`. **Compatible now.**
- **Tasks:** types and a `simpleTaskInteractive` server example ship in SDK
  1.30.0.

**Go / no-go for Phase 3: GO**, on the current SDK line, independent of Phase 1.

**Unverified and needed before Phase 3 ships:** whether Claude renders the
extensions-framework build of Apps or the January 2026 build. The matrix page is
blocked from this sandbox. A human with a Claude conversation can settle it in
two minutes by connecting any published Apps reference server.

---

## Discrepancies between Appendix A and the fetched spec

1. **`inputRequired` vs `input_required`.** Appendix A specifies
   `resultType: "inputRequired"`. The 2026-07-28 announcement says
   `resultType: "input_required"` and calls the mechanism Multi Round-Trip
   Requests (MRTR). Casing matters at the wire level. Unresolved; Phase 1 is
   blocked regardless.
2. **Details Appendix A omits:** client identity and capabilities now travel in
   per-request `_meta` rather than initialize; list responses gain `ttlMs` and
   `cacheScope`; authorization moves from Dynamic Client Registration to Client
   ID Metadata Documents with RFC 9207 issuer validation; Roots, Sampling and
   Logging are the three deprecations.
3. **Memory: Appendix A is accurate** and the live docs add specifics worth
   keeping: mounts land at `/mnt/memory/<slugified-name>/` and the real path is
   returned in `mount_path` (do not construct it); precondition shape is
   `{"type": "content_sha256", "content_sha256": "..."}`; caps are 8 stores per
   session, 100 kB per memory, 2,000 memories per store; stores attach only at
   session creation and default to `read_write`.

---

## Conflicts with the brief that need a human decision

1. **Supabase does not exist.** Phase 1 says application state "becomes an
   explicit identifier returned by a tool and persisted in Supabase". The
   equivalent here is Upstash Redis, already wired. Confirm Redis is acceptable
   rather than introducing a database this project has deliberately avoided.
2. **The design language directly contradicts a standing instruction.** The brief
   says to reuse Release Observatory: porcelain `#EDEEE9`, international orange,
   and "Forbidden: near-black dark themes". Earlier in this project you
   instructed the opposite, in writing: *"Do not use Release Observatory or any
   of my previous products as a visual, structural, or stylistic reference"*, and
   the app was then rebuilt on a dark indigo and muted gold identity that you
   approved. Widgets render inside the Claude conversation rather than inside the
   app, so a different palette is defensible, but I will not silently reverse
   your instruction. **Which palette do the widgets use?**
3. **Branching contradicts the workflow in force.** The brief says work on
   `mcp-app-conversion`, never push to `main`, one PR per phase. Your standing
   instruction in this project was to work directly on `main` so Vercel
   auto-deploys. I have followed the brief: this report is on
   `mcp-app-conversion`. Confirm you want PR-per-phase going forward.
4. **Phase 2 is under-scoped.** Making the run a Task means moving orchestration
   out of the browser and onto the server. That is the largest single piece of
   work in the plan and the brief treats it as a wrapper.

---

## Proposed plan

Resequenced so blocked work does not block shippable work.

**A. Assumption correction path** (was Phase 3b's dependency)
Version assumptions instead of hard-locking them; add a correction that
re-runs the review against corrected input.
*Acceptance:* correct an assumption post-review, re-run, and see a downstream
status change. **I can verify this myself** in a headless browser against Demo
Mode recordings.

**B. MCP Apps widgets** (brief Phase 3)
Assumption Matrix first, since it carries the architectural claim. Then Progress
Board, then Risk Board. Risk Board recompute is client-side arithmetic over a
server-provided score, no model call.
*Acceptance:* widget renders in a Claude conversation and a correction changes
downstream output. **Human verification required** — this sandbox cannot load
your connectors.

**C. Server-side orchestration + Tasks** (brief Phase 2)
Move the pipeline loop from `AgentRun.jsx` into a server route that owns run
state in Redis; expose it as a Task. Largest phase.
*Acceptance:* start a run, drop the client, reconnect, see accurate progress.
**I can verify** with protocol-level assertions against a local instance;
**human verifies** the real disconnect case.

**D. Memory store** (brief Phase 4)
Unblocked and independent. Could ship before C.
*Acceptance:* second related decision surfaces an assumption from the first,
attributed. **Human verification required** (needs live API credits).

**E. Stateless core** (brief Phase 1) — **hold** until an SDK ships 2026-07-28
support. Revisit when `LATEST_PROTOCOL_VERSION` moves past `2025-11-25`.

**F. Portfolio artifacts** (brief Phase 5) — last, once behaviour is settled.

---

## What I can and cannot verify

| Can verify in this sandbox | Needs a human in a Claude conversation |
| --- | --- |
| Unit and protocol-level MCP request/response assertions | Whether Claude renders the widget at all |
| Full pipeline behaviour against Demo Mode recordings | Which Apps spec version the host renders |
| Correction changes downstream output | Live Managed Agents runs (needs credits) |
| Build, type, console, accessibility, responsive checks | Real client disconnect and reconnect |
| Widget markup rendered headless at narrow widths | Memory store behaviour across two live runs |

Cloud sessions load only the first-party GitHub integration, so I cannot add
Decision Vitals as a connector and click through it.
