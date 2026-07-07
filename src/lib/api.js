// src/lib/api.js
//
// Thin client for the server-side agent route. Every specialist call goes
// through here so error handling is consistent across screens.

/**
 * Run one specialist via /api/agent and return its parsed JSON output.
 * Throws an Error with a readable message on any failure.
 * @param {string} agent  specialist slug (e.g. "intake", "classifier")
 * @param {object|string} payload  the input for that specialist
 * @returns {Promise<object>}
 */
export async function runAgent(agent, payload) {
  let res;
  try {
    res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, payload }),
    });
  } catch {
    throw new Error(`Could not reach the ${agent} agent (network error).`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`The ${agent} agent returned a non-JSON response (${res.status}).`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data?.error || `The ${agent} agent failed (${res.status}).`);
  }
  return data.output;
}
