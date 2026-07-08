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
//
// The web app (in Live Mode) syncs its decisions up and pulls filed evidence
// down via /api/sync, so agents and the browser stay consistent without the
// app needing a database of record.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { kvConfigured, kvGetJson, kvSetJson, KEYS } from "./_kv.js";

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

  return server;
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
