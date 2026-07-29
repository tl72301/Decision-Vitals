// About page. Business-facing language throughout; the one academic reference
// (the RAND method that inspired it) lives only in the footer credit.

const SectionTitle = ({ children }) => (
  <h2 className="text-lg font-semibold tracking-tight text-fg-1">{children}</h2>
);

const P = ({ children }) => (
  <p className="mt-3 max-w-prose text-base leading-relaxed text-fg-2">
    {children}
  </p>
);

const Strong = ({ children }) => (
  <strong className="font-semibold text-fg-1">{children}</strong>
);

// A titled block with a hairline rule above it, for even vertical rhythm.
const Section = ({ title, children }) => (
  <section className="mt-10 border-t border-line pt-8">
    <SectionTitle>{title}</SectionTitle>
    {children}
  </section>
);

// The review sequence as a small visual: two intake steps, then four review
// steps, in the order they actually run.
const PIPELINE = [
  {
    phase: "On record",
    note: "identify & classify assumptions",
    agents: ["Intake", "Assumption Classifier"],
  },
  {
    phase: "On review",
    note: "examine, challenge, assess, report",
    agents: ["Evidence Review", "Challenge", "Risk Ranking", "Reporter"],
  },
];

function Pipeline() {
  return (
    <div className="mt-5 space-y-3">
      {PIPELINE.map((group) => (
        <div key={group.phase} className="rounded-md border border-line bg-ink-800 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-fg-1">{group.phase}</span>
            <span className="font-mono text-xs text-fg-3">{group.note}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {group.agents.map((agent, i) => (
              <span key={agent} className="flex items-center gap-2">
                <span className="rounded-[3px] border border-line px-2 py-0.5 font-mono text-xs text-fg-2">
                  {agent}
                </span>
                {i < group.agents.length - 1 && (
                  <span aria-hidden="true" className="text-fg-3">
                    →
                  </span>
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
    "Evidence capture stays cheap",
    "Logging a piece of evidence should never take more than a paste. Gmail is the one integration, because email is where most of this arrives anyway. No file parsing, no connectors to configure.",
  ],
  [
    "You edit the assumptions",
    "Before the first review you can reword, rerank, or delete any assumption, so human judgment goes in before the machine's, not after.",
  ],
  [
    "Numbered reviews, not silent monitoring",
    'Each review is an explicit, dated event with an evidence record that doesn\'t change after the fact. That\'s the honest, lightweight version of "always watching."',
  ],
  [
    "Demo mode",
    "The public site replays real recorded reviews, labeled as such, so anyone can try it at no cost; live reviews are passphrase-protected.",
  ],
];

function ProductDecisions() {
  return (
    <dl className="mt-5 divide-y divide-line border-y border-line">
      {PRODUCT_DECISIONS.map(([title, body]) => (
        <div key={title} className="grid gap-1 py-4 sm:grid-cols-[15rem_1fr] sm:gap-6">
          <dt className="text-sm font-medium text-fg-1">{title}</dt>
          <dd className="max-w-prose text-sm leading-relaxed text-fg-2">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-fg-1 sm:text-3xl">
        Decision Vitals
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-2">
        Vital signs for the decisions you've already made. Decision Vitals
        watches the assumptions a business decision rests on and tells you when
        the evidence starts to turn against one.
      </p>

      <Section title="The problem">
        <P>
          Most decisions get made once and are rarely revisited. The assumptions
          underneath them, about customers, capacity, timing, and the market,
          quietly go out of date, and nobody notices until the damage shows up in
          the numbers. Most teams monitor their decisions by gut feel: the review
          happens after the failure, not before it.
        </P>
      </Section>

      <Section title="The idea">
        <P>
          Every decision rests on a few assumptions. Some are{" "}
          <Strong>critical</Strong>: if they turn out to be wrong, the decision
          could seriously weaken or break. Others are <Strong>supporting</Strong>:
          they still matter, but the decision can probably survive if they
          change. Each one gets a <Strong>warning signal</Strong>: the specific
          thing to watch for that would show the assumption may no longer be
          true.
        </P>
        <P>
          This way of pressure-testing a plan comes from a decades-old
          risk-planning method (credited below). The bet here is that AI makes
          it light enough to use on everyday decisions.
        </P>
      </Section>

      <Section title="What it does">
        <P>
          You record a decision and Decision Vitals identifies the assumptions
          underneath it, marks which are critical, and gives each a warning
          signal to watch. You log evidence as it accumulates: meeting notes,
          tickets, customer feedback, market updates. Label an email
          <Strong> decision-evidence</Strong> in Gmail and it can be pulled in
          directly, so the evidence that lands in your inbox does not have to be
          copied by hand.
        </P>
        <P>
          When you review the decision, the review weighs the evidence for and
          against each assumption and produces a Decision Health Report: an
          overall grade, an assessment of each assumption with its supporting
          evidence, the strongest case against it, and recommended next steps.
          Reviews are numbered and dated, so a decision builds a health history
          instead of a single one-time assessment.
        </P>
        <P>
          Nothing about this is one-and-done. Evidence can be added at any
          point, and you can review a decision again whenever something moves.
          From the second review on, the report shows which assumptions changed
          status since the previous one, so you can see an assumption weaken
          before it breaks.
        </P>
      </Section>

      <Section title="How reviews work">
        <P>
          A review is a sequence of six focused AI steps, each with one job.
          Two run when you record a decision: they identify the assumptions and
          classify how much each one matters. Four run the review: one connects
          each piece of evidence to the assumptions it affects, one makes the
          strongest honest case against every assumption, one assesses where
          each assumption stands, and one writes the report.
        </P>
        <P>
          Splitting the work keeps every step focused, and it means no single
          perspective dominates: the step arguing against an assumption has no
          say in the final grade.
        </P>
        <Pipeline />
        <P>
          Every step's findings stay attached to the result, so each conclusion
          can be traced back to the evidence and reasoning behind it. A few
          fixed rules keep the results consistent: a critical assumption with
          strong evidence against it can never be marked as still holding, and
          the overall health grade is computed from the individual assessments.
        </P>
        <P>
          Decision Vitals also connects to Claude directly: from a conversation,
          Claude can list your decisions, inspect their assumptions, and log new
          evidence, which shows up in the app ready for the next review.
        </P>
      </Section>

      <Section title="Product decisions">
        <ProductDecisions />
      </Section>

      <Section title="Limitations">
        <P>
          Results are only as good as the evidence you log, and sources aren't
          weighted, a rumor and an audited number count the same. It works on
          one decision at a time, with no links between related decisions. And
          the model's read on how strongly a piece of evidence cuts is a
          judgment call, the built-in rules limit the worst mistakes but don't
          remove them.
        </P>
        <P>
          Assumptions also lock after the first review. That keeps every report
          traceable to the exact assumptions it judged, but it means a decision
          that changes shape should be recorded as a new decision, not edited in
          place.
        </P>
      </Section>

      <Section title="What's next">
        <P>
          Pulling evidence from more of the places it already lands, linking
          related decisions so a broken assumption in one flags the others, and
          alerting the owner the moment a warning signal shows up rather than
          waiting for a manual review.
        </P>
      </Section>

      <div className="mt-10 border-t border-line pt-6 text-sm text-fg-3">
        <p>
          Built with Claude Code on the web; agents hosted on Claude Managed
          Agents; deployed on Vercel. Inspired by{" "}
          <a
            href="https://www.rand.org/pubs/monograph_reports/MR114.html"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-2 underline-offset-2 transition-colors hover:text-fg-1"
          >
            Assumption-Based Planning (RAND)
          </a>
          .
        </p>
      </div>
    </div>
  );
}
