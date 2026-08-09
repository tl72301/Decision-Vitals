# Decision Vitals — architecture

A note on how the system is put together, and on the handful of decisions that
turned out to be load-bearing. Written for someone deciding whether the design
holds up, not for someone trying to install it — that's the README.

---

## What it does

You record a business decision and the assumptions it rests on. Evidence
accumulates — meeting notes, customer comments, support tickets, emails you
label in Gmail. On demand, six specialists re-weigh every assumption against
everything filed since the last look, and produce a dated Decision Health
Report: which assumptions still hold, which have weakened, and which have been
invalidated by something that actually happened.

The frame is Assumption-Based Planning: a plan is only as sound as its
load-bearing assumptions, and the useful work is watching those assumptions
rather than the plan.

## Why six agents

Six is not a flourish; each stage exists because merging it into a neighbour
measurably degrades the output.

| Agent | Model | Job |
| --- | --- | --- |
| Intake | Haiku 4.5 | Extract 3–5 falsifiable candidate assumptions from a decision |
| Classifier | Haiku 4.5 | Apply the ABP tiers and attach a warning signal to each |
| Evidence Review | Haiku 4.5 | Map each piece of evidence to the assumptions it bears on |
| Challenge | Sonnet 5 | Argue the strongest honest case *against* every assumption |
| Risk Ranking | Haiku 4.5 | Assign a status under a hard rule, with confidence |
| Reporter | Sonnet 5 | Write the report with receipts |

Three properties fall out of the split and would be lost by collapsing it:

**Adversarial separation.** Challenge runs with no knowledge of what Risk
Ranking will conclude, and Risk Ranking cannot see Challenge's reasoning — only
its output. An agent asked to both defend and judge an assumption in one pass
converges; asked separately, they disagree, and the disagreement is the signal.

**A hard rule that a prompt cannot soften.** A load-bearing assumption with any
strong contradicting evidence cannot be graded "holding." That rule lives in
Risk Ranking's contract and is re-derived in code (`deriveHealthGrade`) so an
off-schema grade from the model is overridden rather than trusted.

**Cost that follows difficulty.** The two genuinely open-ended roles run a
Sonnet-class model; the four schema-bound ones run Haiku. Each stage returns
strict JSON against a published schema, which is what makes that split safe —
a cheaper model doing a bounded extraction is not a downgrade.

---

## The three problems worth writing down

### 1. A panel in a conversation has no browser tab behind it

Decisions live in the browser's `localStorage`. That's a deliberate limit — the
app has no accounts and no database of record. But an MCP tool called from a
Claude conversation runs on a serverless function with no tab anywhere near it,
and it still has to read and write the same decision.

The first design synced a snapshot to a single `dv:index` key. That works
only while a tab is open and syncing, which is exactly the case a conversation
isn't. So state moved to **per-decision, server-owned keys** (`dv:decision:<id>`),
written by the app when it's open and by the server when it isn't. Sample
decisions load from `samples.json` through the same interface, so every widget
works with no Redis, no credits, and no tab — which is also what makes the
demo path verifiable.

### 2. Serverless cannot run a multi-minute pipeline

A full review is four agent sessions and takes minutes. Vercel's Hobby ceiling
is 60 seconds, and asking for more doesn't degrade gracefully — the build is
rejected, so the whole site fails to deploy rather than one route running short.

The pipeline is therefore **resumable, one stage per poll**. `advanceReview`
runs exactly one outstanding stage and returns; the task store persists the
outputs; the next poll picks up where it left off. Nothing runs between
requests, so a poll is the only moment work can happen — and a single stage
fits comfortably inside the timeout.

The shape was forced by the platform and turned out to be the better design:
the caller sees real per-stage progress, and a client can disconnect and
reconnect without losing the run.

### 3. A report must not change after it's written

Assumptions stay correctable forever — that's the product. But if a report
rendered from live state, correcting an assumption in March would silently
rewrite what January's report appears to have concluded.

So every finding **snapshots the assumption as judged**: its text, tier, and
revision at the moment of the review. Reports render from that snapshot. Once
that decoupling existed, the post-review lock could be removed safely, which is
what makes the correction loop possible at all.

---

## Two places the system deliberately does arithmetic instead of asking a model

**Risk scoring.** The Risk Board ranks assumptions by exposure —
`importance × fragility`. Risk Ranking emits a status and a confidence, never
numbers, and it is not asked for them: a model producing "likelihood 0.72" is
false precision, and two runs over the same evidence wouldn't agree. The
arithmetic lives in `api/_risk.js`, is deterministic, and is printed on every
row so a reader can check it by hand. Because importance is one factor of a
product and the human owns it, the panel re-scores and re-sorts locally with no
round trip and no model call.

**Cross-decision memory.** The platform's pattern is to mount a memory store
into the session and let the agent read it. Every specialist here declares
`"tools": []`, so nothing in the sandbox can open a file — a mounted store would
be attached and unreachable, and granting four agents filesystem tools to fix
that costs exploration on every stage. So retrieval is inverted: the store is
the durable record, and Decision Vitals decides what's relevant and injects it
with provenance already attached. Attribution is exact because the lookup
happened here, not because a model remembered to say where something came from.

---

## Surfaces

| Surface | What it is |
| --- | --- |
| Web app | Vite + React + Tailwind v4 on Vercel. Demo Mode replays recorded runs; Live Mode is passphrase-gated and spends real credits. |
| MCP server | `api/mcp.js`, Streamable HTTP, stateless. Nine tools. Connects to Claude as a custom connector. |
| MCP Apps panels | Assumption Matrix, Risk Board, Progress Board — `ui://` resources rendered inside the conversation. |
| Gmail pull | Emails labelled `decision-evidence` become evidence, deduplicated, with tracking URLs stripped. |

The panels are why the MCP server exists rather than a plain REST API. A REST
API lets a model *read* your decisions. An MCP App lets a person **change how an
assumption is classified inside the conversation** and have every downstream
stage re-run against the correction — the human-in-the-loop step is the product,
and it needs a surface, not an endpoint.

---

## What the tests are actually for

Two of this project's worst bugs passed handler-level tests and failed the
moment a real client connected:

- `capabilities.tasks.requests.tools.call` was declared as `true` where the
  schema requires an object. Every client rejected the initialize result. The
  only symptom a user saw was "couldn't connect."
- No widget declared a CSP. The spec treats an omitted `connectDomains` as
  `connect-src 'none'`, so every fetch a panel made was killed inside the
  iframe — no request left the sandbox, so nothing appeared in any log.

Neither is reachable from a test that calls the handler directly. So
`check-mcp-client.mjs` and `check-risk-board.mjs` stand the handler up behind a
real HTTP server and connect a genuine MCP `Client` to it, and the CSP is now
asserted on both `resources/list` and `resources/read`.

A third bug is the reason the panels carry a **Connection details** block: a
widget read the tool-result notification one level too deep, and the render
harness encoded the same wrong assumption — so the test and the code agreed with
each other while both disagreed with the wire. An empty panel looks identical
whether the notification never arrived, arrived without a payload, or arrived
and the fetch behind it was blocked. Now it says which.

---

## Known limits

- **Demo Mode recordings are fixed.** A correction made in Demo Mode is
  replayed against a recording that never saw it, so the downstream output
  doesn't move. Live Mode is the honest path for that loop.
- **Memory has not run live.** The logic is checked against a stubbed store;
  no run with credits has exercised the real `/v1/memory_stores` endpoints.
- **Retrieval is keyword overlap**, which will not find a related decision that
  shares no vocabulary. That's a deliberate trade for a corpus of tens of
  decisions and a rule a person can argue with.
- **No accounts.** One owner, one browser, one passphrase.
