# Run your own Decision Vitals

Decision Vitals is single-owner by design: one person, one deployment, one set
of decisions. There are no accounts and no shared database. To use it, you run
your own copy.

That means **you use your own Anthropic API key and pay for your own agent
runs.** A review is four agent sessions. Nothing here bills anyone else.

This guide is written to be handed to Claude Code (or followed by hand). Steps
1–3 give you a working app. Steps 4–6 are optional and each adds one capability.

---

## What you need before starting

- A **GitHub account** (to fork the repo)
- A **Vercel account** — the free Hobby tier is enough for personal use
- An **Anthropic API key** with credits, from <https://console.anthropic.com>
- Optional, for steps 4–6: a **Claude account** with connector access, and a
  **Google Cloud** project if you want Gmail ingestion

---

## Step 1 — Deploy

1. Fork <https://github.com/tl72301/Decision-Vitals> to your own GitHub account.
2. In Vercel, **Add New → Project**, import your fork.
3. Accept the detected settings. It's a Vite app; `vercel.json` already supplies
   the SPA rewrite so deep links survive a refresh. **Don't override the build
   command.**
4. Deploy. It will build but not yet work — no key is set.

## Step 2 — Set the two required environment variables

In Vercel → your project → **Settings → Environment Variables**, scope **Production**:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com. Read only on the server; it never reaches a browser. |
| `LIVE_MODE_PASSPHRASE` | Any secret phrase you invent. This unlocks Live Mode and gates the MCP endpoint. |

**Pick a fresh passphrase — don't reuse a password.** It travels in a URL later,
so treat it as a bearer token: anyone holding it can read and write your
decisions.

Redeploy after saving (Vercel doesn't apply new variables to an existing build).

## Step 3 — Register the six agents

Visit once, in a browser:

```
https://<your-site>.vercel.app/api/setup
```

It reads `agents.json` and creates the six specialists in your Anthropic
account, returning a slug → id map. It's idempotent — safe to call again, and
it's how you push a prompt edit later (change `agents.json`, push, hit
`/api/setup` again).

**You now have a working app.** Open the site. Demo Mode replays recorded runs
for free; Live Mode asks for your passphrase and spends real credits.

---

## Step 4 — (Optional) Storage, needed for everything below

Add the **Upstash for Redis** integration from the Vercel Marketplace to your
project. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
Redeploy.

Without this, the app works fine on its own. With it you get the MCP server,
cross-decision memory, and Gmail ingestion — all three need somewhere the
*server* can read and write, because none of them has a browser tab behind them.

## Step 5 — (Optional) Connect it to Claude

1. Open the app in **Live Mode** once so it syncs your decisions to storage.
2. In Claude: **Settings → Connectors → Add custom connector**, URL:

   ```
   https://<your-site>.vercel.app/api/mcp?key=<LIVE_MODE_PASSPHRASE>
   ```

3. Start a **new** conversation and try: *"Show me the risk board for sample-cafe."*

You should get an interactive panel in the chat, not a wall of text.

> **If a tool seems missing**, reconnect the connector. The tool list is cached
> per connector, and a new conversation alone won't refresh it after you deploy.
>
> **If a panel is empty**, expand **Connection details** on it. It reports
> whether the data arrived and, if not, where it stopped.

## Step 6 — (Optional) Pull evidence from Gmail

1. In **Google Cloud Console**, create an OAuth client of type **Web
   application**. Set the authorized redirect URI to exactly:

   ```
   https://<your-site>.vercel.app/api/gmail-auth
   ```

2. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel. Redeploy.
3. Visit `https://<your-site>.vercel.app/api/gmail-auth?key=<LIVE_MODE_PASSPHRASE>`
   and consent with your own Google account. The page prints a refresh token.
4. Add it as `GOOGLE_REFRESH_TOKEN` in Vercel. Redeploy.
5. In Gmail, label the emails you want ingested **`decision-evidence`** (override
   the label name with a `GMAIL_LABEL` variable if you prefer another).
6. Open a decision in Live Mode and click **Pull from Gmail**.

The scope requested is `gmail.readonly` — the app can read labelled messages and
nothing else. Pulled emails are deduplicated, and tracking URLs are stripped
from the body before the text is stored.

---

## Verify it works

```bash
npm install
npm run build                       # production build
node scripts/check-mcp-client.mjs   # connects a real MCP client over real HTTP
node scripts/check-risk-board.mjs   # risk scoring, then the same over MCP
node scripts/check-memory.mjs       # cross-decision memory against a stubbed store
```

All four should pass with no environment variables set — they stub what they need.

---

## Things worth knowing

**Costs are yours.** A review is four agent sessions: two on a Sonnet-class
model, two on Haiku. Demo Mode costs nothing; every Live Mode review costs
real money. There is no quota in the app — if you hand your connector URL to
someone else, they spend your credits.

**The passphrase is the only gate.** No login, no accounts. Whoever has the URL
has full access to your decisions. Rotate it by changing the Vercel variable and
updating the connector URL to match.

**Vercel Hobby caps functions at 60 seconds.** The review pipeline is built for
this — it runs one stage per poll and resumes — so it works on the free tier.
Don't raise `maxDuration` past 60 in `api/review.js`: the build is *rejected*
above the plan limit, so the whole site fails to deploy rather than one route
running long.

**Demo Mode recordings are fixed.** A correction made in Demo Mode replays
against a recording that never saw it, so downstream output won't move. Use Live
Mode to see the correction loop actually work.

**Your data lives in two places**: decisions in your browser's `localStorage`,
and a server-side copy in Redis for the agent-facing paths. Clearing your
browser data loses the browser copy.

For how the system is put together and why, see
[`architecture.md`](architecture.md). For a walkthrough to show someone, see
[`demo.md`](demo.md).
