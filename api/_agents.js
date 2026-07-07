// api/_agents.js
//
// Shared server-side helpers for talking to the Claude Managed Agents API.
// Files under /api whose name starts with "_" are treated as helpers by Vercel,
// not as routable serverless functions.
//
// The six specialist definitions live in agents.json at the repo root (the single
// place to edit prompts). We read it with fs + import.meta.url so Vercel's file
// tracer bundles it regardless of the Node version's JSON-import support.

import { readFileSync } from "node:fs";

const agentsConfig = JSON.parse(
  readFileSync(new URL("../agents.json", import.meta.url), "utf8")
);

/** The six specialist definitions, in pipeline order. */
export const AGENTS = agentsConfig.agents;

export const ANTHROPIC_BASE = "https://api.anthropic.com";
export const ANTHROPIC_BETA = "managed-agents-2026-04-01";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Headers for every Managed Agents request. The key stays server-side. */
export function apiHeaders(apiKey) {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-beta": ANTHROPIC_BETA,
    "content-type": "application/json",
  };
}

/** Read the API key from the environment or throw a clear error. */
export function requireApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set on the server. Add it as a Vercel environment variable."
    );
  }
  return key;
}

/** Look up a configured specialist by its stable slug (e.g. "evidence_review"). */
export function agentByKey(key) {
  return AGENTS.find((a) => a.key === key);
}

/**
 * List every agent in the account, following pagination, and index by name.
 * Tolerates both the standard { data, has_more, last_id } envelope and a bare
 * array response.
 * @returns {Promise<Map<string, any>>} name -> latest agent object
 */
export async function listAllAgents(apiKey) {
  const byName = new Map();
  let afterId = null;
  for (let guard = 0; guard < 100; guard++) {
    const url = new URL(`${ANTHROPIC_BASE}/v1/agents`);
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetch(url, { headers: apiHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`List agents failed (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    const data = Array.isArray(json) ? json : json.data ?? [];
    for (const a of data) {
      if (a && a.name) byName.set(a.name, a);
    }
    if (Array.isArray(json) || !json.has_more) break;
    afterId = json.last_id ?? data[data.length - 1]?.id;
    if (!afterId) break;
  }
  return byName;
}

/**
 * Resolve the configured specialists to their live agent IDs by name.
 * @returns {Promise<Record<string, string>>} slug -> agent id (only found ones)
 */
export async function resolveAgentIds(apiKey) {
  const byName = await listAllAgents(apiKey);
  const map = {};
  for (const def of AGENTS) {
    const existing = byName.get(def.name);
    if (existing) map[def.key] = existing.id;
  }
  return map;
}
