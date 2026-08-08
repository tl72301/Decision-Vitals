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
import { assumptionMatrixHtml } from "./_widget.js";

const MATRIX_URI = "ui://decision-vitals/assumption-matrix";

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
  const server = new McpServer({ name: "decision-vitals", version: "1.0.0" });

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

  return server;
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
