// api/mcp.js
//
// Decision Vitals as an MCP server (Streamable HTTP, stateless). Connect it
// to Claude as a custom connector:
//   https://<your-site>/api/mcp?key=<LIVE_MODE_PASSPHRASE>
//
// Tools:
//   list_decisions  - the decisions currently registered, with health grades
//   get_decision    - one decision's assumptions, importance, and status
//   add_evidence    - file a new piece of evidence against a decision
//   open_assumptions    - render the Assumption Matrix widget for a decision
//   correct_assumptions - apply human corrections, then re-run the review
//   start_review        - run the review as a task, polled for per-stage progress
//   watch_review        - start a review and render the live Progress Board
//   review_progress     - current per-stage progress for a running review
//
// The last two are the human-in-the-loop path: a person changes how an
// assumption is classified and every downstream stage re-runs against the
// correction.
//
// The web app (in Live Mode) syncs its decisions up and pulls filed evidence
// down via /api/sync, so agents and the browser stay consistent without the
// app needing a database of record.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { kvConfigured, kvGetJson, kvSetJson, KEYS } from "./_kv.js";
import {
  readDecisionState,
  writeDecisionState,
  applyCorrection,
} from "./_state.js";
import { assumptionMatrixHtml, progressBoardHtml } from "./_widget.js";
import {
  RedisTaskStore,
  readTaskRecord,
  writeTaskRecord,
} from "./_task-store.js";
import { STAGES, STAGE_LABEL } from "./_review-core.js";

const MATRIX_URI = "ui://decision-vitals/assumption-matrix";
const BOARD_URI = "ui://decision-vitals/progress-board";

const SOURCE_TYPES = [
  "meeting_notes",
  "customer_feedback",
  "support_ticket",
  "market_update",
  "status_update",
];

// Product-language labels for the internal enums.
const TIER_LABEL = {
  load_bearing: "critical",
  vulnerable: "supporting",
  lower_risk: "minor",
};
const STATUS_LABEL = {
  untested: "not checked yet",
  holding: "holding",
  weakened: "weakened",
  invalidated: "invalidated",
  needs_review: "needs review",
};

const text = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const errorText = (message) => ({ ...text(message), isError: true });

async function getIndex() {
  if (!kvConfigured()) {
    throw new Error(
      "Storage not configured. Add the Upstash for Redis integration in Vercel, then open the app in Live Mode once to sync."
    );
  }
  const index = await kvGetJson(KEYS.index);
  if (!index || !Array.isArray(index.decisions) || index.decisions.length === 0) {
    throw new Error(
      "No decisions synced yet. Open the Decision Vitals app in Live Mode once; it syncs decisions here automatically."
    );
  }
  return index;
}

function buildServer() {
  const server = new McpServer(
    { name: "decision-vitals", version: "1.0.0" },
    {
      // Task state lives in Redis, not memory: every request here is a fresh
      // serverless instance. The onPoll tick is what advances a review, since
      // nothing runs between requests.
      taskStore: new RedisTaskStore({ onPoll: advanceReviewTask }),
      capabilities: {
        // Declares that tools/call may create a task. Without this the SDK
        // refuses task creation before a handler is ever reached.
        tasks: { requests: { tools: { call: true } } },
      },
    }
  );

  server.registerTool(
    "list_decisions",
    {
      title: "List decisions",
      description:
        "List the business decisions currently registered in Decision Vitals, with their health grade and assumption counts.",
      inputSchema: {},
    },
    async () => {
      const { decisions, updatedAt } = await getIndex();
      return text({
        updatedAt,
        decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          healthGrade: d.healthGrade ?? "not yet reviewed",
          assumptions: (d.assumptions ?? []).length,
          evidenceCount: d.evidenceCount ?? 0,
        })),
      });
    }
  );

  server.registerTool(
    "get_decision",
    {
      title: "Get a decision",
      description:
        "Get one decision's statement and its assumptions, including each assumption's importance (critical/supporting/minor), current status, and the warning signal to watch for.",
      inputSchema: { decisionId: z.string().describe("The decision id from list_decisions") },
    },
    async ({ decisionId }) => {
      const { decisions } = await getIndex();
      const d = decisions.find((x) => x.id === decisionId);
      if (!d) {
        return errorText(
          `No decision with id "${decisionId}". Known ids: ${decisions.map((x) => x.id).join(", ")}`
        );
      }
      return text({
        id: d.id,
        title: d.title,
        statement: d.statement,
        healthGrade: d.healthGrade ?? "not yet reviewed",
        evidenceCount: d.evidenceCount ?? 0,
        assumptions: (d.assumptions ?? []).map((a) => ({
          id: a.id,
          text: a.text,
          importance: TIER_LABEL[a.tier] ?? a.tier,
          status: STATUS_LABEL[a.status] ?? a.status,
          warningSignal: a.signpost ?? "",
        })),
      });
    }
  );

  server.registerTool(
    "add_evidence",
    {
      title: "Add evidence",
      description:
        "File a new piece of evidence against a decision (a meeting note, customer comment, ticket, or market/status update). It appears in the Decision Vitals app within about 20 seconds while the app is open in Live Mode; the owner can then re-review the decision.",
      inputSchema: {
        decisionId: z.string().describe("The decision id from list_decisions"),
        text: z.string().min(1).describe("The evidence itself, quoted or paraphrased faithfully"),
        sourceType: z.enum(SOURCE_TYPES).optional()
          .describe("Where this came from (defaults to meeting_notes)"),
        date: z.string().optional().describe("When it happened, YYYY-MM-DD (defaults to today)"),
      },
    },
    async ({ decisionId, text: evidenceText, sourceType, date }) => {
      const { decisions } = await getIndex();
      const d = decisions.find((x) => x.id === decisionId);
      if (!d) {
        return errorText(
          `No decision with id "${decisionId}". Known ids: ${decisions.map((x) => x.id).join(", ")}`
        );
      }
      const item = {
        id: randomUUID(),
        decisionId,
        text: evidenceText,
        sourceType: sourceType ?? "meeting_notes",
        date: date ?? new Date().toISOString().slice(0, 10),
        addedAt: new Date().toISOString(),
        via: "mcp",
      };
      const inbox = (await kvGetJson(KEYS.inbox)) ?? [];
      inbox.push(item);
      await kvSetJson(KEYS.inbox, inbox);
      return text(
        `Filed evidence against "${d.title}" (${item.sourceType}, ${item.date}). ` +
          `It will appear in the app's evidence list within ~20 seconds while the app is open in Live Mode.`
      );
    }
  );

  // ---- MCP Apps: the human-in-the-loop surface -------------------------
  //
  // The widget is a predeclared template the host can review before rendering.
  // It carries no data: the tool result supplies the decision, and the widget
  // reads current state from /api/decision-state, which is server-owned and
  // never depends on a browser tab having synced recently.
  registerAppResource(
    server,
    "assumption-matrix",
    MATRIX_URI,
    {
      title: "Assumption Matrix",
      description:
        "Review and correct the assumptions behind a decision, then re-run the review.",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/html;profile=mcp-app",
          text: assumptionMatrixHtml(),
        },
      ],
    })
  );

  registerAppTool(
    server,
    "open_assumptions",
    {
      title: "Open assumptions",
      description:
        "Show the assumptions behind a decision so they can be reviewed and corrected.",
      inputSchema: { decisionId: z.string().describe("Decision id") },
      _meta: { ui: { resourceUri: MATRIX_URI } },
    },
    async ({ decisionId }) => {
      const state = await readDecisionState(decisionId);
      if (!state) {
        return {
          content: [{ type: "text", text: `No decision "${decisionId}".` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Showing ${state.assumptions.length} assumptions for "${state.decision.title}". ` +
              `Change how one is classified and the review re-runs against the correction.`,
          },
        ],
        structuredContent: { decisionId, state },
      };
    }
  );

  registerAppTool(
    server,
    "correct_assumptions",
    {
      title: "Correct assumptions",
      description:
        "Apply human corrections to a decision's assumptions and re-run the review against them.",
      inputSchema: {
        decisionId: z.string(),
        corrections: z
          .array(
            z.object({
              assumptionId: z.string(),
              text: z.string().optional(),
              tier: z.enum(["load_bearing", "vulnerable", "lower_risk"]).optional(),
              signpost: z.string().optional(),
              outOfScope: z.boolean().optional(),
            })
          )
          .min(1),
        rerun: z.boolean().optional(),
      },
      _meta: { ui: { resourceUri: MATRIX_URI } },
    },
    async ({ decisionId, corrections, rerun }) => {
      let state = await readDecisionState(decisionId);
      if (!state) {
        return {
          content: [{ type: "text", text: `No decision "${decisionId}".` }],
          isError: true,
        };
      }

      const applied = [];
      for (const c of corrections) {
        const { state: next, before, after } = applyCorrection(state, c.assumptionId, c);
        state = next;
        applied.push({ id: c.assumptionId, before, after });
      }
      state = await writeDecisionState(decisionId, state);

      let report = null;
      let rerunError = null;
      if (rerun !== false) {
        try {
          report = await rerunReview(decisionId);
          const fresh = await readDecisionState(decisionId);
          if (fresh) state = fresh;
        } catch (e) {
          rerunError = String(e?.message || e);
        }
      }

      const lines = applied.map((a) => {
        const bits = [];
        if (a.before.tier !== a.after.tier) {
          bits.push(`importance ${(TIER_LABEL[a.before.tier] ?? a.before.tier)} -> ${(TIER_LABEL[a.after.tier] ?? a.after.tier)}`);
        }
        if (a.before.text !== a.after.text) bits.push("reworded");
        if (!a.before.outOfScope && a.after.outOfScope) bits.push("marked out of scope");
        if (a.before.outOfScope && !a.after.outOfScope) bits.push("brought back into scope");
        return `- ${a.after.text}: ${bits.join(", ") || "updated"}`;
      });

      const summary = report
        ? `Re-reviewed against the corrections. Overall health: ${report.healthGrade}.`
        : rerunError
          ? `Corrections saved, but the re-review failed: ${rerunError}`
          : "Corrections saved.";

      return {
        content: [
          { type: "text", text: `${lines.join("\n")}\n\n${summary}` },
        ],
        structuredContent: { decisionId, state, report },
      };
    }
  );

  // ---- Progress Board --------------------------------------------------
  //
  // Read-only. It answers "what is happening right now" during a multi-minute
  // run, which is the gap a task id alone leaves. Progress comes from the task
  // record, so the board reports what actually ran rather than a simulation.
  registerAppResource(
    server,
    "progress-board",
    BOARD_URI,
    {
      title: "Review progress",
      description: "Live per-stage progress for a decision review.",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/html;profile=mcp-app", text: progressBoardHtml() },
      ],
    })
  );

  registerAppTool(
    server,
    "watch_review",
    {
      title: "Review a decision and watch progress",
      description:
        "Start a review of a decision and show its progress stage by stage as it runs.",
      inputSchema: { decisionId: z.string().describe("Decision id") },
      _meta: { ui: { resourceUri: BOARD_URI } },
    },
    async ({ decisionId }) => {
      const state = await readDecisionState(decisionId);
      if (!state) {
        return {
          content: [{ type: "text", text: `No decision "${decisionId}".` }],
          isError: true,
        };
      }
      const store = new RedisTaskStore();
      const task = await store.createTask({ ttl: 30 * 60 * 1000 });
      const record = await readTaskRecord(task.taskId);
      await writeTaskRecord(task.taskId, {
        ...record,
        pipeline: { decisionId, outputs: {}, timings: {} },
      });

      return {
        content: [
          {
            type: "text",
            text: `Reviewing "${state.decision.title}". ${STAGES.length} stages; progress updates as each finishes.`,
          },
        ],
        structuredContent: {
          taskId: task.taskId,
          decisionId,
          decisionTitle: state.decision.title,
          taskStatus: "working",
          statusMessage: "Starting",
          stages: progressRows({ outputs: {}, timings: {} }, "working"),
        },
      };
    }
  );

  registerAppTool(
    server,
    "review_progress",
    {
      title: "Review progress",
      description:
        "Current per-stage progress for a running review. Advances the run by one stage.",
      inputSchema: { taskId: z.string().describe("Task id from watch_review") },
      _meta: { ui: { resourceUri: BOARD_URI } },
    },
    async ({ taskId }) => {
      let record = await readTaskRecord(taskId);
      if (!record) {
        return {
          content: [{ type: "text", text: `No review task "${taskId}".` }],
          isError: true,
        };
      }
      if (record.task.status === "working") {
        record = (await advanceReviewTask(record)) ?? record;
      }

      const pipeline = record.pipeline ?? {};
      const status = record.task.status;
      const report = pipeline.report ?? null;

      return {
        content: [
          { type: "text", text: record.task.statusMessage ?? status },
        ],
        structuredContent: {
          taskId,
          taskStatus: status,
          statusMessage: record.task.statusMessage ?? "",
          stages: progressRows(pipeline, status),
          report: report
            ? {
                runNumber: report.runNumber,
                healthGrade: report.healthGrade,
                summary: report.summary,
              }
            : null,
          error: status === "failed" ? record.task.statusMessage : null,
        },
      };
    }
  );

  // ---- The review as a task -------------------------------------------
  //
  // A full run is four agent sessions and takes minutes, so it returns a task
  // id immediately rather than holding a request open. Each poll advances one
  // stage (see _task-store.js for why that is the shape on serverless), so the
  // caller sees real per-stage progress and can disconnect and reconnect
  // without losing the run.
  server.experimental.tasks.registerToolTask(
    "start_review",
    {
      title: "Review a decision",
      description:
        "Weigh the evidence for and against each assumption and produce a dated decision-health report. Returns a task to poll.",
      inputSchema: { decisionId: z.string().describe("Decision id") },
      execution: { taskSupport: "required" },
    },
    {
      createTask: async ({ decisionId }, extra) => {
        const state = await readDecisionState(decisionId);
        if (!state) throw new Error(`No decision "${decisionId}".`);

        const task = await extra.taskStore.createTask({ ttl: 30 * 60 * 1000 });
        const record = await readTaskRecord(task.taskId);
        await writeTaskRecord(task.taskId, {
          ...record,
          task: {
            ...record.task,
            statusMessage: `Starting review of "${state.decision.title}" (0 of ${STAGES.length} stages)`,
          },
          pipeline: { decisionId, outputs: {} },
        });
        return { task };
      },
      getTask: async (_args, extra) => extra.taskStore.getTask(extra.taskId),
      getTaskResult: async (_args, extra) => extra.taskStore.getTaskResult(extra.taskId),
    }
  );

  return server;
}

/**
 * Per-stage rows for the Progress Board, derived from what the task actually
 * recorded. A stage is "done" when its output exists, "running" when it is the
 * next one and the task is still working, "failed" when the task failed on it.
 */
function progressRows(pipeline, taskStatus) {
  const outputs = pipeline?.outputs ?? {};
  const timings = pipeline?.timings ?? {};
  const nextStage = STAGES.find((s) => !(s in outputs));
  return STAGES.map((agent) => {
    let status = "pending";
    if (agent in outputs) status = "done";
    else if (agent === nextStage) {
      status = taskStatus === "failed" ? "failed" : taskStatus === "working" ? "running" : "pending";
    }
    return {
      agent,
      name: STAGE_NAME[agent] ?? agent,
      what: STAGE_LABEL[agent] ?? "",
      status,
      elapsedMs: timings[agent] ?? null,
    };
  });
}

const STAGE_NAME = {
  evidence_review: "Evidence Review",
  challenge: "Challenge",
  risk_ranking: "Risk Ranking",
  reporter: "Reporter",
};

/**
 * Advance a review task by one stage. Called from the task store on every poll,
 * because on serverless a poll is the only moment work can happen.
 *
 * A failing stage marks the task failed with the stage that failed and why,
 * rather than leaving a task that never resolves.
 */
async function advanceReviewTask(record) {
  const { advanceReview } = await import("./_review-core.js");
  const pipeline = record.pipeline;
  if (!pipeline?.decisionId) return record;

  const startedAt = Date.now();
  try {
    const step = await advanceReview(pipeline.decisionId, pipeline);
    const timings = { ...(pipeline.timings ?? {}) };
    if (step.stage) timings[step.stage] = Date.now() - startedAt;

    if (step.done) {
      const next = {
        ...record,
        task: {
          ...record.task,
          status: "completed",
          statusMessage: `Review complete. Overall health: ${step.report.healthGrade}.`,
        },
        result: {
          content: [
            {
              type: "text",
              text:
                `Review #${step.report.runNumber} complete. ` +
                `Overall health: ${step.report.healthGrade}.\n\n${step.report.summary}`,
            },
          ],
          structuredContent: { decisionId: pipeline.decisionId, report: step.report },
        },
        pipeline: { ...pipeline, timings, report: step.report },
      };
      return writeTaskRecord(record.task.taskId, next);
    }

    const doneCount = Object.keys(step.outputs).length;
    return writeTaskRecord(record.task.taskId, {
      ...record,
      task: {
        ...record.task,
        status: "working",
        statusMessage: `${STAGE_LABEL[step.stage] ?? step.stage} (${doneCount} of ${STAGES.length} stages)`,
      },
      pipeline: { ...pipeline, outputs: step.outputs, timings },
    });
  } catch (e) {
    const stage = STAGES.find((x) => !(x in (pipeline.outputs ?? {}))) ?? "unknown";
    return writeTaskRecord(record.task.taskId, {
      ...record,
      task: {
        ...record.task,
        status: "failed",
        statusMessage: `${STAGE_LABEL[stage] ?? stage} failed: ${String(e?.message || e)}`,
      },
      result: {
        content: [
          {
            type: "text",
            text: `The review stopped at "${STAGE_LABEL[stage] ?? stage}": ${String(e?.message || e)}`,
          },
        ],
        isError: true,
      },
    });
  }
}

/**
 * Re-run the review server-side after a correction. Imported lazily so the
 * connector's read-only tools do not pull the agent runner into every request.
 */
async function rerunReview(decisionId) {
  const { runReviewForDecision } = await import("./_review-core.js");
  return runReviewForDecision(decisionId);
}

export default async function handler(req, res) {
  // CORS. A connector may reach this endpoint from a browser origin, in which
  // case the browser sends an OPTIONS preflight first. Answering that with 405
  // and no CORS headers fails the connection before the MCP handshake is ever
  // attempted, which surfaces to the user only as "couldn't connect".
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization, accept, mcp-session-id, mcp-protocol-version, last-event-id"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Same gate as the rest of Live Mode: the passphrase, passed as ?key= or a
  // bearer token, since MCP clients can't easily set custom headers.
  const required = process.env.LIVE_MODE_PASSPHRASE;
  if (required) {
    const urlKey = new URL(req.url, "http://localhost").searchParams.get("key");
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (urlKey !== required && bearer !== required) {
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: pass ?key=<passphrase> in the connector URL." },
        id: null,
      });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This MCP endpoint is stateless; POST only." },
      id: null,
    });
  }

  // The SDK's transport rejects a request whose Accept header does not list
  // BOTH application/json and text/event-stream, with a 406. Clients that only
  // ever expect JSON therefore cannot connect. This server runs with
  // enableJsonResponse and never opens an SSE stream, so it only ever replies
  // with application/json: widening the inbound header satisfies the guard
  // without any client receiving a content type it did not ask for.
  const accept = String(req.headers.accept ?? "");
  if (!accept.includes("text/event-stream")) {
    const widened = accept.includes("application/json")
      ? `${accept}, text/event-stream`
      : "application/json, text/event-stream";
    req.headers.accept = widened;
    // The transport converts this Node request to a Web Request via Hono,
    // which reads rawHeaders rather than the parsed headers object, so both
    // have to be updated or the widening is silently ignored.
    if (Array.isArray(req.rawHeaders)) {
      let found = false;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (String(req.rawHeaders[i]).toLowerCase() === "accept") {
          req.rawHeaders[i + 1] = widened;
          found = true;
        }
      }
      if (!found) req.rawHeaders.push("accept", widened);
    }
  }

  try {
    // Stateless mode: a fresh server + transport per request, JSON responses.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: String(e?.message || e) },
        id: null,
      });
    }
  }
}
