// About page: the portfolio case study. Business-facing language throughout;
// the one academic reference (the RAND method that inspired it) lives only in
// the small footer credit.

const SectionTitle = ({ children }) => (
  <h2 className="mt-10 text-lg font-semibold tracking-tight text-stone-900">
    {children}
  </h2>
);

const P = ({ children }) => (
  <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-stone-700">
    {children}
  </p>
);

export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Case study
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
        Decision Vitals
      </h1>
      <P>
        Vital signs for the decisions you've already made. Decision Vitals
        watches the assumptions a business decision rests on and tells you when
        the evidence starts to turn against one.
      </P>

      <SectionTitle>The problem</SectionTitle>
      <P>
        Decisions get made once and reviewed never. The assumptions underneath
        them, about customers, capacity, timing, and the market, quietly go out
        of date, and nobody notices until the damage shows up in the numbers.
        Most teams monitor their decisions by gut feel: the review happens after
        the failure, not before it.
      </P>

      <SectionTitle>The idea</SectionTitle>
      <P>
        Every decision rests on a few assumptions. Some are{" "}
        <strong>critical</strong>: if they turn out to be wrong, the decision
        could seriously weaken or break. Others are{" "}
        <strong>supporting</strong>: they still matter, but the decision can
        probably survive if they change. For each one there is a{" "}
        <strong>warning signal</strong>, the specific thing you should watch for
        that would show the assumption may no longer be true. This way of
        pressure-testing a plan comes from a decades-old risk-planning method
        (credited below); the bet here is that AI agents make it light enough to
        actually use on everyday decisions.
      </P>

      <SectionTitle>What it does</SectionTitle>
      <P>
        You register a decision and Decision Vitals pulls out the assumptions
        underneath it, marks which are critical, and gives each a warning signal
        to watch. You paste in evidence as it accumulates: meeting notes,
        tickets, customer feedback, market updates. When you review the
        decision, four specialist agents map the evidence to each assumption,
        argue against every one of them, grade where each stands, and write a
        Decision Health Report: an overall grade, a verdict for each assumption
        with the quoted evidence behind it, the strongest case against, and
        concrete next steps. Reviews are numbered, so a decision builds up a
        health history instead of a single one-time verdict.
      </P>

      <SectionTitle>How it's built</SectionTitle>
      <P>
        Six specialist agents run on Claude Managed Agents, each its own named,
        versioned configuration: two extract and label the assumptions when you
        register a decision, and four (Evidence Review, Challenge, Risk Ranking,
        and Reporter) run the review. The heavier-judgment roles run on a
        larger model; the structured extraction runs on a faster one. The app
        runs them in a fixed sequence with a typed handoff between each step,
        and every run is traceable back to its session on the platform.
      </P>
      <P>
        A few rules sit on top of the model's judgment so the results stay
        consistent: a critical assumption with strong evidence against it can
        never be marked as still holding, and the overall health grade is
        computed from the individual verdicts rather than left to the model.
        Multi-agent coordination on the platform was left out on purpose, an
        app-driven sequence is simpler to reason about and is the obvious place
        to go next.
      </P>
      <P>
        Decision Vitals is also an MCP server: connect it to Claude and an
        agent can list your decisions, inspect their assumptions, and file new
        evidence straight from a conversation, where it shows up in the app
        ready for the next review.
      </P>

      <SectionTitle>Product decisions</SectionTitle>
      <P>
        <strong>Paste-only evidence.</strong> No integrations, no file parsing.
        Adoption beats automation for a tool like this: if capturing a piece of
        evidence takes more than a paste, it doesn't happen.
      </P>
      <P>
        <strong>You edit the assumptions.</strong> Before the first review you
        can reword, re-rank, or delete any assumption, so human judgment goes in
        before the machine's, not after.
      </P>
      <P>
        <strong>Numbered reviews, not silent monitoring.</strong> Each review is
        an explicit, dated event with an evidence trail that doesn't change after
        the fact. That's the honest, lightweight version of "always watching."
      </P>
      <P>
        <strong>Demo mode.</strong> The public site replays real recorded agent
        runs, labeled as such, so anyone can try it with no cost; live runs are
        passphrase-protected.
      </P>

      <SectionTitle>Limitations</SectionTitle>
      <P>
        Results are only as good as the evidence you paste in, and sources
        aren't weighted, a rumor and an audited number count the same. It works
        on one decision at a time, with no links between related decisions. And
        the model's read on how strongly a piece of evidence cuts is a judgment
        call, the built-in rules limit the worst mistakes but don't remove them.
      </P>

      <SectionTitle>What's next</SectionTitle>
      <P>
        Pulling evidence automatically from one source (a project tool is the
        natural first one), linking related decisions so a broken assumption in
        one flags the others, and alerting the owner the moment a warning signal
        shows up rather than waiting for a manual review.
      </P>

      <div className="mt-10 border-t border-stone-200 pt-6 text-sm text-stone-500">
        <p>
          Built with Claude Code on the web; agents hosted on Claude Managed
          Agents; deployed on Vercel. Inspired by{" "}
          <a
            href="https://www.rand.org/pubs/monograph_reports/MR114.html"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700"
          >
            Assumption-Based Planning (RAND)
          </a>
          .
        </p>
      </div>
    </div>
  );
}
