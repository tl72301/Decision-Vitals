// scripts/check-setup-gate.mjs
//
// Asserts that /api/setup refuses callers without the Live Mode passphrase and
// does so before any request reaches the Anthropic API.
//
// The route writes to the owner's agent definitions, so an open route lets
// anyone revert prompt edits and read back every agent's id and model. It was
// open by accident until #19; this check exists so a later edit cannot quietly
// reopen it.
//
// The network is stubbed and every request bound for the Anthropic API is
// counted, so "no API request on a 401" is asserted rather than assumed. Run
// against the pre-#19 file, this check fails its six gate assertions.
//
// Throwaway values only. No real key or passphrase is read or needed.
//
// Run: node scripts/check-setup-gate.mjs
// Exits non-zero on failure.

const PASS = "throwaway-test-passphrase";
process.env.ANTHROPIC_API_KEY = "throwaway-test-key";

const apiRequests = [];
globalThis.fetch = async (url, init = {}) => {
  apiRequests.push(`${init.method ?? "GET"} ${new URL(url.toString()).pathname}`);
  const J = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
  // Listing agents returns none, so the route takes the create path for all six.
  if ((init.method ?? "GET") === "GET") return J({ data: [], has_more: false });
  return J({ id: "agent_stub", version: 1 });
};

// Resolved from this file's location, not an absolute path, so the check runs
// wherever the repository is cloned.
const handler = (await import(new URL("../api/setup.js", import.meta.url))).default;

async function hit(method, url) {
  apiRequests.length = 0;
  let status = 0;
  let body = null;
  const res = {
    setHeader() { return this; },
    status(c) { status = c; return this; },
    json(o) { body = o; return this; },
  };
  await handler({ method, url, headers: {} }, res);
  return { status, body, apiRequests: apiRequests.length };
}

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}\n         ${JSON.stringify(detail)}`);
    failures++;
  }
}

console.log("with LIVE_MODE_PASSPHRASE set:");
process.env.LIVE_MODE_PASSPHRASE = PASS;

let r = await hit("GET", "/api/setup");
check("missing key -> 401", r.status === 401, r);
check("missing key -> no Anthropic request", r.apiRequests === 0, r);

r = await hit("GET", "/api/setup?key=wrong");
check("wrong key -> 401", r.status === 401, r);
check("wrong key -> no Anthropic request", r.apiRequests === 0, r);

r = await hit("GET", "/api/setup?key=");
check("empty key -> 401", r.status === 401, r);

r = await hit("GET", `/api/setup?key=${PASS.toUpperCase()}`);
check("wrong-case key -> 401 (exact match)", r.status === 401, r);

r = await hit("GET", "/api/setup?key=wrong");
check("401 body does not echo the passphrase", !JSON.stringify(r.body).includes(PASS), r.body);

r = await hit("GET", `/api/setup?key=${encodeURIComponent(PASS)}`);
check("correct key over GET (a browser visit) -> 200", r.status === 200, r);
check("correct key -> registers all six agents", r.body?.count === 6, r.body);
check("correct key -> reaches the Anthropic API", r.apiRequests > 0, r);

r = await hit("POST", `/api/setup?key=${encodeURIComponent(PASS)}`);
check("correct key over POST -> 200", r.status === 200, r);

r = await hit("PUT", `/api/setup?key=${encodeURIComponent(PASS)}`);
check("unsupported method -> 405", r.status === 405, r);

// Unset means ungated, the same rule every other gated route follows.
console.log("with LIVE_MODE_PASSPHRASE unset:");
delete process.env.LIVE_MODE_PASSPHRASE;
r = await hit("GET", "/api/setup");
check("no passphrase configured -> proceeds, 200", r.status === 200, r);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
