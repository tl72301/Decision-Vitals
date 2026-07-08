// api/_gmail.js
//
// Minimal Gmail client for the owner-pull integration (plain fetch, no SDK).
// The owner authorizes once with their own Google account; the refresh token
// lives in Vercel env vars and never leaves the server. Scope needed:
// https://www.googleapis.com/auth/gmail.readonly

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google token refresh failed (${res.status}): ${json.error_description || json.error || "no access token"}`
    );
  }
  return json.access_token;
}

/** Ids of messages carrying the evidence label, newest first. */
export async function listLabeledMessageIds(accessToken, label, max = 10) {
  const url = new URL(`${GMAIL_BASE}/messages`);
  url.searchParams.set("q", `label:${label}`);
  url.searchParams.set("maxResults", String(max));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail list failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return (json.messages ?? []).map((m) => m.id);
}

/** Walk a Gmail payload tree and return the first text/plain body, decoded. */
function extractPlainText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  return "";
}

const header = (message, name) =>
  message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  )?.value ?? "";

/** Fetch one message and reduce it to evidence-ready fields. */
export async function getMessage(accessToken, id) {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail get failed (${res.status}): ${await res.text()}`);
  }
  const message = await res.json();

  const subject = header(message, "Subject");
  const from = header(message, "From");
  const dateHeader = header(message, "Date");
  const parsed = new Date(dateHeader);
  const date = Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);

  // Body: prefer the decoded text/plain part, fall back to Gmail's snippet.
  // Cut quoted reply chains and collapse whitespace so the evidence reads clean.
  let body = extractPlainText(message.payload) || message.snippet || "";
  const replyMarker = body.search(/\r?\nOn .* wrote:/);
  if (replyMarker > 0) body = body.slice(0, replyMarker);
  body = body.replace(/\s+/g, " ").trim().slice(0, 1200);

  return { id, subject, from, date, body };
}
