// api/no-oauth.js
//
// Answers OAuth discovery probes with a definitive 404.
//
// This server has no OAuth. It authenticates with a ?key= query parameter on
// the connector URL. A client that probes /.well-known/oauth-authorization-server
// or /.well-known/oauth-protected-resource must get a 404 so it concludes there
// is no authorization server and proceeds unauthenticated; anything else (a 200
// carrying the SPA, say) makes it attempt dynamic client registration, which
// fails with an opaque "couldn't register with the sign-in service".
//
// A rewrite in vercel.json points every /.well-known/ path here, so this does
// not rely on a negative lookahead behaving a particular way.

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(404).json({
    error: "not_found",
    error_description:
      "This MCP server does not use OAuth. Pass the passphrase as ?key= on the connector URL.",
  });
}
