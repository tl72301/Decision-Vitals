# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/tl72301/Decision-Vitals/security/advisories/new)
rather than a public issue. I'll acknowledge within a few days.

## What this project's security model actually is

Decision Vitals is **single-owner by design**. There are no accounts. If you
self-host it, understand these before putting anything sensitive in it:

- **`LIVE_MODE_PASSPHRASE` is the only gate.** It covers every route that spends
  your API key or changes your data: Live Mode, the MCP endpoint, agent setup
  (`/api/setup`), starting Gmail setup, the Gmail pull, and sync. It travels in
  URLs as a `?key=` query parameter, so treat it as a bearer token: anyone
  holding it can read your decisions, file evidence, start reviews, and
  overwrite your agent definitions. Generate a random value; never reuse a
  password. **Leave it unset and all of those routes are open.**
- **One deliberate exception.** Reading a single decision's state
  (`GET /api/decision-state?id=…`) needs no passphrase, so the panels inside a
  Claude conversation can load their data without putting the passphrase into
  browser-visible markup. Anyone with a decision's ID can read it. Your own
  decisions get random UUIDs; the bundled samples have fixed, public IDs.
- **Agent runs bill to your own key.** There is no quota anywhere in the app. If
  you share your connector URL, you are sharing your API spend.
- **Decisions live in your browser's `localStorage`**, with a server-side copy in
  Redis for the paths that have no browser tab behind them (the MCP server,
  memory, Gmail pull).
- **Gmail access is read-only** (`gmail.readonly`) and limited to messages you
  label yourself.

## If you leak a credential

Rotating the app's passphrase is enough **only if that string is used nowhere
else**. If you have reused it, changing the value here protects nothing —
change it on every service where it appears, starting with the email account
that can reset the others.

Rewriting git history does not remove a value from GitHub: commits stay
reachable through `refs/pull/*` refs that only GitHub Support can purge. Assume
anything pushed to a public repository has been scraped.

Enable **secret scanning and push protection** on your fork. Both are free for
public repositories, and push protection blocks the commit rather than
requiring this whole cleanup afterwards.
