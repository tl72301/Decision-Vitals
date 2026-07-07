// api/setup.js
//
// Idempotent registration route for the six Decision Vitals specialists.
//
// Reads agents.json and, for each specialist, creates the agent if it does not
// exist (matched by its stable name) or updates it to the current definition
// otherwise. Updating with an unchanged config is a no-op on the platform, so
// calling this route repeatedly is safe. Returns the resolved slug -> id map so
// the Claude Console (and /api/agent) can find each agent.
//
// A prompt edit is: change agents.json, push, hit /api/setup once.

import {
  AGENTS,
  ANTHROPIC_BASE,
  apiHeaders,
  requireApiKey,
  listAllAgents,
} from "./_agents.js";

function agentBody(def) {
  return {
    name: def.name,
    model: def.model,
    system: def.system,
    tools: def.tools ?? [], // no tools: these agents only transform provided text
    description: def.description,
  };
}

async function createAgent(apiKey, def) {
  const res = await fetch(`${ANTHROPIC_BASE}/v1/agents`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(agentBody(def)),
  });
  if (!res.ok) {
    throw new Error(`Create "${def.key}" failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function getAgent(apiKey, id) {
  const res = await fetch(`${ANTHROPIC_BASE}/v1/agents/${id}`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Get agent ${id} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Update requires the current version. A 409 means our version was stale
// (concurrent setup call); refetch the live version and retry once.
async function updateAgent(apiKey, def, existing) {
  let version = existing.version;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${ANTHROPIC_BASE}/v1/agents/${existing.id}`, {
      method: "POST",
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ version, ...agentBody(def) }),
    });
    if (res.ok) return res.json();
    if (res.status === 409 && attempt === 0) {
      version = (await getAgent(apiKey, existing.id)).version;
      continue;
    }
    throw new Error(`Update "${def.key}" failed (${res.status}): ${await res.text()}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let apiKey;
  try {
    apiKey = requireApiKey();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  try {
    const byName = await listAllAgents(apiKey);
    const results = [];
    for (const def of AGENTS) {
      const existing = byName.get(def.name);
      const agent = existing
        ? await updateAgent(apiKey, def, existing)
        : await createAgent(apiKey, def);
      results.push({
        key: def.key,
        name: def.name,
        id: agent.id,
        version: agent.version,
        model: def.model,
        action: existing ? "updated" : "created",
      });
    }
    return res.status(200).json({ ok: true, count: results.length, agents: results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
