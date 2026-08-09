# Decision Vitals — demo script

Two walkthroughs. The first needs nothing but a browser. The second needs the
MCP connector and spends credits.

Both are written to be *shown*, so each beat says what to point at and what the
audience should take from it. Times are for a live walkthrough, not a recording.

---

## A. Five minutes, no setup

Demo Mode replays recorded runs, so this costs nothing and cannot fail on a
timeout. Open <https://decision-vitals.vercel.app>.

**1 · The dashboard (30s).** Load a sample decision. Point at the health grade
and the assumption count.

> "This isn't a project tracker. It's watching the assumptions the decision
> rests on — the things that, if they turn out to be wrong, mean the decision
> was wrong."

**2 · The assumptions (60s).** Open the decision. Show the tiers — critical,
supporting, minor — and read one **warning signal** aloud.

> "The warning signal is the point. Each assumption comes with what you'd
> expect to see if it were failing. That's what makes it falsifiable rather
> than a hope."

**3 · Evidence (45s).** Show the evidence list and where it comes from: typed
in, filed by an agent from a Claude conversation, or pulled from Gmail by
labelling an email `decision-evidence`.

> "Evidence arrives continuously. The review is on demand — you re-run it when
> enough has accumulated to be worth a look."

**4 · Run the review (90s).** Start it and narrate the stages as they land.

> "Six specialists. Evidence Review maps each piece of evidence to the
> assumptions it bears on. Challenge then argues the strongest honest case
> *against* every assumption — separately, so it can't see what the ranking
> will conclude. Risk Ranking assigns a status under a hard rule: a critical
> assumption with strong contradicting evidence cannot be graded 'holding'.
> Reporter writes it up with receipts."

**5 · The report (60s).** Open it. Point at a status that moved
(`Holding → Weakened`) and at the receipt underneath.

> "Every judgement quotes the evidence it rests on. If you disagree, you can
> see exactly what it read."

**6 · The close (30s).** Return to the dashboard.

> "Nothing here is a one-off. Evidence keeps arriving, and you re-review
> whenever it's worth it. The report is dated because the answer has a shelf
> life."

---

## B. The part that needs the connector

This is the interesting half — and the half that needs Live Mode, credits, and
a connected MCP server. Set it up before an audience is watching.

**Setup:** in Claude → Settings → Connectors → Add custom connector, with
`https://<your-site>/api/mcp?key=<LIVE_MODE_PASSPHRASE>`. If you've just
deployed a new tool, reconnect the connector — the tool list is cached, and a
new conversation alone won't pick it up.

**1 · The panel renders (45s).** Ask:

> Open the assumptions for sample-cafe

A panel appears **inside the conversation** with the four assumptions and an
importance dropdown on each.

> "That's not a screenshot and it's not a link. It's an interactive panel the
> server sent, running in the conversation. This is what an MCP server buys
> that a REST API doesn't — the model can read your decisions either way, but
> only this lets a person change one here."

**2 · The correction loop (2m).** Change an assumption's importance from
Supporting to Critical and apply.

> "That correction goes back to the server, and the review re-runs against it.
> Every downstream stage sees the corrected input — Challenge argues against
> the corrected assumption, Risk Ranking applies the hard rule to it. The
> human is in the loop at the one point where their judgement is better than
> the model's: what actually matters."

Wait for the re-review, then show what moved in the new report.

**3 · The Risk Board (90s).** Ask:

> Show me the risk board for sample-cafe

Point at the arithmetic printed on each row.

> "Exposure is importance times fragility. The Risk Ranking agent never emits
> a number — it says holding or weakened, and how sure it is. A model
> producing 'likelihood 0.72' would be false precision, and two runs wouldn't
> agree. So the arithmetic is ours, it's deterministic, and it's printed so you
> can check it."

Change an importance dropdown. The board reorders instantly.

> "No round trip and no model call. Exposure is a product and importance is
> the factor you own, so re-weighting is local arithmetic. Applying it saves
> the change and re-runs the review — that's the round trip."

**4 · Filing evidence from the conversation (45s).** Ask:

> Add evidence to sample-cafe: the landlord raised the renewal rate 12%.

Then show it in the app.

> "It appears in the app within about twenty seconds. The conversation and the
> app are the same system, not two views of a synced copy."

---

## Notes for whoever runs this

- **Demo Mode recordings are fixed.** If you make a correction in Demo Mode,
  the downstream output won't move — the recording never saw it. Do the
  correction beat in Live Mode or skip it.
- **Live Mode costs money and takes minutes.** Four agent sessions per review.
  Don't start one with sixty seconds left in the meeting.
- **If a panel comes up empty**, open **Connection details** on it. It records
  whether the notification arrived, whether it carried a payload, and whether
  the fetch behind it failed — which is the difference between a deploy that
  hasn't landed and a real bug.
- **The strongest single moment** is beat B·2 — a person changing a
  classification in a conversation and the whole pipeline re-running against
  it. If you only have five minutes and a working connector, do B·1 and B·2 and
  skip everything else.
