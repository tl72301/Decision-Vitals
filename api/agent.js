// api/agent.js
//
// Runs one specialist as a Managed Agents session and returns its parsed JSON.
//
// POST { agent: "<slug>", payload: <object|string> }
//   1. resolve the slug to a live agent id (run /api/setup first if missing)
//   2. create a session against the shared cloud environment
//   3. send the payload as the user message
//   4. poll until the session goes idle AND a new agent.message has arrived
//   5. parse the message text as JSON; on parse failure, nudge once for "JSON only"
//   6. return the parsed object
//
// The ANTHROPIC_API_KEY is read only here on the server and never sent to the
// browser. Sessions are left intact so each run is traceable in the Claude Console.

import {
  ANTHROPIC_BASE,
  apiHeaders,
  requireApiKey,
  agentByKey,
  resolveAgentIds,
  resolveEnvironmentId,
} from "./_agents.js";

export const config = { maxDuration: 60 };

const POLL_INTERVAL_MS = 1200;
const DEADLINE_MS = 55_000; // stay under the 60s function limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createSession(apiKey, agentId, environmentId, title) {
  const res = await fetch(`${ANTHROPIC_BASE}/v1/sessions`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ agent: agentId, environment_id: environmentId, title }),
  });
  if (!res.ok) {
    throw new Error(`Create session failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()).id;
}

async function sendUserMessage(apiKey, sessionId, text) {
  const res = await fetch(`${ANTHROPIC_BASE}/v1/sessions/${sessionId}/events`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      events: [{ type: "user.message", content: [{ type: "text", text }] }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Send message failed (${res.status}): ${await res.text()}`);
  }
}

async function getStatus(apiKey, sessionId) {
  const res = await fetch(`${ANTHROPIC_BASE}/v1/sessions/${sessionId}`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Get session failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()).status;
}

/** All agent.message texts in this session, oldest first. */
async function listAgentMessages(apiKey, sessionId) {
  const url = new URL(`${ANTHROPIC_BASE}/v1/sessions/${sessionId}/events`);
  url.searchParams.set("limit", "100");
  url.searchParams.append("types[]", "agent.message");
  const res = await fetch(url, { headers: apiHeaders(apiKey) });
  if (!res.ok) {
    throw new Error(`List events failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const data = Array.isArray(json) ? json : json.data ?? [];
  return data
    .slice()
    .sort((a, b) =>
      String(a.processed_at ?? "").localeCompare(String(b.processed_at ?? ""))
    )
    .map((ev) =>
      (ev.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
    );
}

/**
 * Send a message and wait for the resulting agent reply.
 * A turn is complete when the session is idle again AND the number of
 * agent.message events has grown past `prevCount`.
 * @returns {Promise<{text: string, count: number}>}
 */
async function runTurn(apiKey, sessionId, text, prevCount, deadline) {
  await sendUserMessage(apiKey, sessionId, text);
  await sleep(400); // let the harness flip to running

  while (Date.now() < deadline) {
    const status = await getStatus(apiKey, sessionId);
    if (status === "terminated") {
      throw new Error("Session terminated before producing output.");
    }
    const messages = await listAgentMessages(apiKey, sessionId);
    if (messages.length > prevCount && status === "idle") {
      return { text: messages[messages.length - 1], count: messages.length };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for the agent to finish.");
}

/** Parse strict JSON, tolerating stray code fences or preamble defensively. */
function parseJsonLoose(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Agent did not return valid JSON.");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body ?? {};
  const { agent: agentSlug, payload } = body;
  const def = agentSlug && agentByKey(agentSlug);
  if (!def) {
    return res
      .status(400)
      .json({ ok: false, error: `Unknown agent "${agentSlug}".` });
  }
  if (payload === undefined || payload === null) {
    return res.status(400).json({ ok: false, error: "Missing payload." });
  }

  let apiKey;
  try {
    apiKey = requireApiKey();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  const messageText =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const deadline = Date.now() + DEADLINE_MS;
  let sessionId;

  try {
    const [agentIds, environmentId] = await Promise.all([
      resolveAgentIds(apiKey),
      resolveEnvironmentId(apiKey),
    ]);
    const agentId = agentIds[agentSlug];
    if (!agentId) {
      return res.status(409).json({
        ok: false,
        error: `Agent "${agentSlug}" is not registered yet. Call /api/setup first.`,
      });
    }

    sessionId = await createSession(
      apiKey,
      agentId,
      environmentId,
      `Decision Vitals · ${def.name}`
    );

    let { text, count } = await runTurn(apiKey, sessionId, messageText, 0, deadline);

    let output;
    try {
      output = parseJsonLoose(text);
    } catch {
      // One retry: nudge for JSON-only in the same session.
      ({ text } = await runTurn(
        apiKey,
        sessionId,
        "Return ONLY valid JSON matching the schema. No markdown, no preamble, no code fences.",
        count,
        deadline
      ));
      output = parseJsonLoose(text); // if this throws, the catch below reports it
    }

    return res.status(200).json({ ok: true, agent: agentSlug, sessionId, output });
  } catch (e) {
    // 502: the pipeline reached the platform but the run failed — the frontend
    // surfaces this as an error card.
    return res
      .status(502)
      .json({ ok: false, agent: agentSlug, sessionId, error: String(e?.message || e) });
  }
}
