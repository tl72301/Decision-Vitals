// api/gmail-auth.js
//
// One-time owner setup to capture a Gmail refresh token. Visit
//   https://<site>/api/gmail-auth?key=<LIVE_MODE_PASSPHRASE>
// consent with your own Google account, and this page prints the refresh token
// to paste into Vercel as GOOGLE_REFRESH_TOKEN. Requires GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET (from a Google Cloud OAuth "Web application" client whose
// authorized redirect URI is exactly this route's URL).

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function page(title, bodyHtml) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1c1917;line-height:1.5">
${bodyHtml}</body>`;
}

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const redirectUri = `${proto}://${host}/api/gmail-auth`;
  const url = new URL(req.url, `${proto}://${host}`);
  const code = url.searchParams.get("code");

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!clientId || !clientSecret) {
    return res
      .status(200)
      .send(page("Gmail setup", "<h2>Gmail not configured</h2><p>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel first.</p>"));
  }

  // Step 1: start consent (gated by the passphrase so strangers can't trigger it).
  if (!code) {
    const required = process.env.LIVE_MODE_PASSPHRASE;
    if (required && url.searchParams.get("key") !== required) {
      return res.status(401).send(page("Gmail setup", "<h2>Passphrase required</h2><p>Add <code>?key=YOUR_PASSPHRASE</code> to this URL.</p>"));
    }
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", SCOPE);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    res.statusCode = 302;
    res.setHeader("Location", auth.toString());
    return res.end();
  }

  // Step 2: exchange the code for tokens and show the refresh token.
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.refresh_token) {
      return res.status(200).send(
        page(
          "Gmail setup",
          `<h2>No refresh token returned</h2><p>${json.error_description || json.error || "Try again"}. If you have authorized this app before, revoke it at <a href="https://myaccount.google.com/permissions">Google account permissions</a> and retry, since Google only returns a refresh token on first consent.</p>`
        )
      );
    }
    return res.status(200).send(
      page(
        "Gmail connected",
        `<h2>Gmail connected</h2>
<p>Copy this refresh token and add it in Vercel as <code>GOOGLE_REFRESH_TOKEN</code>, then redeploy:</p>
<textarea readonly rows="4" style="width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid #e7e5e4;border-radius:8px" onclick="this.select()">${json.refresh_token}</textarea>
<p style="color:#57534e;font-size:14px">Then label the emails you want ingested with <code>decision-evidence</code> in Gmail, open a decision in Live Mode, and click <b>Pull from Gmail</b>.</p>`
      )
    );
  } catch (e) {
    return res.status(200).send(page("Gmail setup", `<h2>Setup error</h2><pre>${String(e?.message || e)}</pre>`));
  }
}
