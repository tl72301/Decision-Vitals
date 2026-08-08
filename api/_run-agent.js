// api/_run-agent.js
//
// Runs one specialist as a Managed Agents session and returns its parsed JSON.
// Extracted from api/agent.js so the server-side pipeline (api/review.js) can
// drive the same stages without going back through HTTP.
//
// The ANTHROPIC_API_KEY is read only on the server and never reaches a browser.
// Sessions are left intact so each run stays traceable in the Claude Console.

import { ANTHROPIC_BASE, apiHeaders, agentByKey } from "./_agents.js";

const POLL_INTERVAL_MS = 1200;

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
 * Send a message and wait for the resulting agent reply. A turn is complete
 * when the session is idle again AND the agent.message count has grown.
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
export function parseJsonLoose(text) {
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

/**
 * Run one specialist end to end.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.agentSlug
 * @param {string} opts.agentId       resolved id for the slug
 * @param {string} opts.environmentId
 * @param {object|string} opts.payload
 * @param {number} opts.deadline      epoch ms after which to give up
 * @returns {Promise<{output: object, sessionId: string}>}
 */
export async function runOneAgent({
  apiKey,
  agentSlug,
  agentId,
  environmentId,
  payload,
  deadline,
}) {
  const def = agentByKey(agentSlug);
  const messageText =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);

  const sessionId = await createSession(
    apiKey,
    agentId,
    environmentId,
    `Decision Vitals · ${def?.name ?? agentSlug}`
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
    output = parseJsonLoose(text);
  }

  return { output, sessionId };
}
