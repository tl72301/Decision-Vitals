// api/_widget.js
//
// Builds the Assumption Matrix widget markup served over ui://.
//
// MCP Apps renders UI resources as text/html in a sandboxed iframe with no
// network access to third-party origins, so the official app bridge is inlined
// rather than fetched. The bridge is read from the installed package at module
// load and cached for the lifetime of the function instance.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

const BRIDGE_PLACEHOLDER = "/*__MCP_APP_BRIDGE__*/";

// A widget runs in a sandboxed iframe whose origin is NOT this server, so a
// relative fetch resolves against the sandbox and never reaches the API. The
// real origin is only known per request, so it is injected at read time.
const ORIGIN_PLACEHOLDER = "__DV_ORIGIN__";

const cache = new Map();

/** The Assumption Matrix, with the MCP Apps bridge inlined. */
export function assumptionMatrixHtml(origin) {
  return widgetHtml("assumption-matrix.html", origin);
}

/** The Pipeline Progress Board, with the MCP Apps bridge inlined. */
export function progressBoardHtml(origin) {
  return widgetHtml("progress-board.html", origin);
}

/** The Risk Board, with the MCP Apps bridge inlined. */
export function riskBoardHtml(origin) {
  return widgetHtml("risk-board.html", origin);
}

/** Read a widget template and inline the bridge. Cached per function instance. */
function widgetHtml(file, origin = "") {
  const key = `${file}\n${origin}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const template = readFileSync(join(HERE, "..", "src", "widgets", file), "utf8");
  const bridgeSrc = readFileSync(
    require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"),
    "utf8"
  );

  // The bundle is an ES module whose public names are minified internally and
  // only surfaced by a trailing `export { xY as App, ... }`. Inlining the source
  // alone therefore leaves `App` undefined. Rewrite that export list into an
  // object literal on a single global instead, which keeps every binding in
  // scope for the widget code below the placeholder without a second import
  // (a sandboxed iframe cannot fetch one).
  const inlined = rewriteExportsToGlobal(bridgeSrc, "__MCP_APP__");

  // Replacer function, not a string: a minified bundle contains `$&` and `$'`
  // sequences, which String.replace would interpret as pattern references and
  // splice parts of the template back into the script.
  const html = template
    .replace(BRIDGE_PLACEHOLDER, () => inlined)
    .replaceAll(ORIGIN_PLACEHOLDER, () => origin);
  cache.set(key, html);
  return html;
}

/**
 * The origin this request arrived on, used both for the widget's own fetches
 * and for the CSP that has to permit them. Vercel terminates TLS at the edge,
 * so the forwarded headers are the only accurate source.
 */
export function originOf(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return host ? `${String(proto).split(",")[0]}://${String(host).split(",")[0]}` : "";
}

/**
 * Turn an ES module bundle's trailing `export { local as Public, ... }` into
 * `globalThis.<name> = { Public: local, ... }`, so the bundle can be inlined
 * into a script and its exports still reached by name.
 *
 * Throws rather than returning a half-working widget: a silently missing
 * binding surfaces as a blank panel inside a Claude conversation, which is far
 * harder to diagnose than a failure here.
 */
export function rewriteExportsToGlobal(source, globalName) {
  const match = source.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!match) {
    throw new Error("Could not find the bundle's export list to rewrite.");
  }
  const pairs = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [local, exported] = entry.split(/\s+as\s+/).map((x) => x.trim());
      return `${JSON.stringify(exported ?? local)}: ${local}`;
    });

  return (
    source.slice(0, match.index) +
    `\n;globalThis.${globalName} = { ${pairs.join(", ")} };\n`
  );
}
