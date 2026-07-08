// api/_kv.js
//
// Minimal Upstash Redis REST client (plain fetch, no SDK). Used as the small
// shared store that bridges the browser's localStorage world and the MCP
// server: a snapshot of decisions (dv:index) and an inbox of evidence filed
// by agents (dv:inbox). Provision it in Vercel via the Upstash for Redis
// marketplace integration; the env vars below are injected automatically.

const url =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function kvConfigured() {
  return Boolean(url && token);
}

/** Run one Redis command, e.g. cmd("SET", "key", "value"). */
async function cmd(...args) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`KV command failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result;
}

/** Get a JSON value (null if missing). */
export async function kvGetJson(key) {
  const raw = await cmd("GET", key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Set a JSON value. */
export async function kvSetJson(key, value) {
  await cmd("SET", key, JSON.stringify(value));
}

/** Delete a key. */
export async function kvDel(key) {
  await cmd("DEL", key);
}

export const KEYS = {
  index: "dv:index",
  inbox: "dv:inbox",
};
