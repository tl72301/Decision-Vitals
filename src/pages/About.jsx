// About page: the portfolio case study. Business-facing language throughout;
// the one academic reference (the RAND method that inspired it) lives only in
// the small footer credit.

const SectionTitle = ({ children }) => (
  <h2 className="text-lg font-semibold tracking-tight text-stone-900">
    {children}
  </h2>
);

const P = ({ children }) => (
  <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-stone-700">
    {children}
  </p>
);

// A titled block with a hairline rule above it, for even vertical rhythm.
const Section = ({ title, children }) => (
  <section className="mt-10 border-t border-stone-200 pt-8">
    <SectionTitle>{title}</SectionTitle>
    {children}
  </section>
);

// The agent pipeline as a small visual: two setup agents, then four review
// agents, in the order they actually run.
const PIPELINE = [
  {
    phase: "On register",
    note: "extract & label assumptions",
    agents: ["Intake", "Assumption Classifier"],
  },
  {
    phase: "On review",
    note: "map, challenge, grade, report",
    agents: ["Evidence Review", "Challenge", "Risk Ranking", "Reporter"],
  },
];

function Pipeline() {
  return (
    <div className="mt-5 space-y-3">
      {PIPELINE.map((group) => (
        <div
          key={group.phase}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-700">
              {group.phase}
            </span>
            <span className="text-xs text-stone-400">{group.note}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {group.agents.map((agent, i) => (
              <span key={agent} className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-200">
                  {agent}
                </span>
                {i < group.agents.length - 1 && (
                  <span className="text-stone-300">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const PRODUCT_DECISIONS = [
  [
    "Paste-only evidence",
    "No integrations, no file parsing. Adoption beats automation for a tool like this: if capturing a piece of evidence takes more than a paste, it doesn't happen.",
  ],
  [
    "You edit the assumptions",
    "Before the first review you can reword, re-rank, or delete any assumption, so human judgment goes in before the machine's, not after.",
  ],
  [
    "Numbered reviews, not silent monitoring",
    'Each review is an explicit, dated event with an evidence trail that doesn\'t change after the fact. That\'s the honest, lightweight version of "always watching."',
  ],
  [
    "Demo mode",
    "The public site replays real recorded agent runs, labeled as such, so anyone can try it with no cost; live runs are passphrase-protected.",
  ],
];

function ProductDecisions() {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {PRODUCT_DECISIONS.map(([title, body]) => (
        <div
          key={title}
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-stone-600">
            {body}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero */}
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
        Decision Vitals
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-stone-600">
        Vital signs for the decisions you've already made. Decision Vitals
        watches the assumptions a business decision rests on and tells you when
        the evidence starts to turn against one.
      </p>

      <Section title="The problem">
        <P>
          Decisions get made once and reviewed never. The assumptions underneath
          them, about customers, capacity, timing, and the market, quietly go out
          of date, and nobody notices until the damage shows up in the numbers.
          Most teams monitor their decisions by gut feel: the review happens after
          the failure, not before it.
        </P>
      </Section>

      <Section title="The idea">
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
      </Section>

      <Section title="What it does">
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
      </Section>

      <Section title="How it's built">
        <P>
          Six specialist agents run on Claude Managed Agents, each its own named,
          versioned configuration: two extract and label the assumptions when you
          register a decision, and four (Evidence Review, Challenge, Risk Ranking,
          and Reporter) run the review. The two most open-ended roles, arguing
          against the plan and writing the report, run on a larger model; the four
          structured steps run on a faster one. The app runs them in a fixed
          sequence with a typed handoff between each step, and every run is
          traceable back to its session on the platform.
        </P>
        <Pipeline />
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
      </Section>

      <Section title="Product decisions">
        <ProductDecisions />
      </Section>

      <Section title="Limitations">
        <P>
          Results are only as good as the evidence you paste in, and sources
          aren't weighted, a rumor and an audited number count the same. It works
          on one decision at a time, with no links between related decisions. And
          the model's read on how strongly a piece of evidence cuts is a judgment
          call, the built-in rules limit the worst mistakes but don't remove them.
        </P>
      </Section>

      <Section title="What's next">
        <P>
          Pulling evidence automatically from one source (a project tool is the
          natural first one), linking related decisions so a broken assumption in
          one flags the others, and alerting the owner the moment a warning signal
          shows up rather than waiting for a manual review.
        </P>
      </Section>

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
