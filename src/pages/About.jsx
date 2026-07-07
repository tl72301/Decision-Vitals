// About page: the portfolio case study (PLAN.md Section 12), drafted from the
// outline. Plain content, muted styling, honest framing throughout.

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
        Vital signs for the decisions you've already made: a lightweight,
        multi-agent implementation of Assumption-Based Planning that watches
        the assumptions under a business decision and tells you when they stop
        holding.
      </P>

      <SectionTitle>The problem</SectionTitle>
      <P>
        Decisions get made once and reviewed never. The assumptions underneath
        them — about customers, capacity, timing, the market — quietly expire,
        and nobody notices until the damage shows up in the numbers. Most
        organizations monitor decisions by vibes: the review happens after the
        failure, not before it.
      </P>

      <SectionTitle>The inspiration: Assumption-Based Planning</SectionTitle>
      <P>
        Assumption-Based Planning is a RAND methodology built on a simple
        taxonomy: identify the assumptions a plan rests on, mark the ones that
        are <em>load-bearing</em> (the plan fails if they're false) and{" "}
        <em>vulnerable</em> (plausibly false within the plan's horizon), attach{" "}
        <em>signposts</em> (observable signals that an assumption is failing),
        and prepare <em>shaping actions</em> (strengthen the assumption) and{" "}
        <em>hedging actions</em> (prepare for its failure). It rarely gets used
        outside defense planning for one reason: it's heavy. It assumes a
        planning staff. The thesis of this project is that language-model
        agents make ABP cheap enough to run continuously on ordinary business
        decisions.
      </P>

      <SectionTitle>What it does</SectionTitle>
      <P>
        You register a decision and Decision Vitals extracts its assumptions,
        tiers them, and gives each one a signpost. You paste in evidence as it
        accumulates — meeting notes, tickets, customer feedback, market
        updates. When you run a review, four specialist agents map evidence to
        assumptions, argue against every assumption, apply status rules, and
        write a Decision Health Report: a grade, per-assumption verdicts with
        quoted evidence receipts, the strongest disconfirming case, and
        concrete shaping and hedging actions. Reviews are versioned, so a
        decision accumulates a health history instead of a single verdict.
      </P>

      <SectionTitle>Agent architecture</SectionTitle>
      <P>
        Six specialist agents run on Claude Managed Agents, each a named,
        versioned agent definition on the Claude Platform: Intake and
        Classifier at registration; Evidence Review, Challenge, Risk Ranking,
        and Reporter at review time. Judgment-heavy roles (Challenge, Reporter)
        run on a Sonnet-class model; structured extraction runs on Haiku. The
        application orchestrates them as a deterministic sequential pipeline
        with typed JSON contracts — each agent's output schema is the next
        agent's input contract — and every run produces a traceable session in
        the Claude Console.
      </P>
      <P>
        Deterministic rules are layered on top of model judgment. A
        load-bearing assumption with strong contradicting evidence can never be
        marked "holding," and the health grade derives mechanically from
        assumption statuses — the app enforces both even if a model drifts.
        The platform's research-preview agent-to-agent coordination was
        skipped deliberately: app-driven sequencing is simpler, not
        access-gated, and easier to reason about. Platform-level coordination
        is the obvious next step, and it's on the roadmap.
      </P>

      <SectionTitle>Product decisions</SectionTitle>
      <P>
        <strong>Paste-only evidence.</strong> No integrations, no parsing.
        Adoption beats automation for a tool like this: if capturing evidence
        takes more than a paste, it doesn't happen.
      </P>
      <P>
        <strong>User-editable assumptions.</strong> You can reword, retier, or
        delete assumptions before the first review — human judgment enters the
        loop before machine review, not after.
      </P>
      <P>
        <strong>Versioned reviews, not background monitoring.</strong> Each
        review is an explicit, numbered event with an immutable evidence
        trail. That's the honest, lightweight version of "continuous
        monitoring."
      </P>
      <P>
        <strong>Demo Mode.</strong> The public site replays recorded real
        agent runs, labeled as such. Recorded, not faked — and the live
        pipeline is passphrase-gated so the demo stays reliable and free to
        host.
      </P>

      <SectionTitle>Limitations</SectionTitle>
      <P>
        Evidence quality is user-dependent, and sources aren't weighted — a
        rumor and an audited number carry the same formal weight. Scope is
        single-decision: there's no dependency tracking between decisions. And
        the model's judgment on evidence direction and strength is not
        calibrated; the deterministic rules bound its worst failure modes, but
        they don't eliminate judgment error.
      </P>

      <SectionTitle>What I'd build next</SectionTitle>
      <P>
        Scheduled evidence pulls from one source (a project tool is the
        natural first candidate), assumption dependency links across decisions,
        and signpost alerting — notify the owner when a signpost fires rather
        than waiting for a manual review. Cross-decision propagation, where one
        invalidated assumption cascades into every decision that shares it, is
        the follow-on project.
      </P>

      <div className="mt-10 border-t border-stone-200 pt-6 text-sm text-stone-500">
        <p>
          Built with Claude Code on the web; agents hosted on Claude Managed
          Agents; deployed on Vercel.{" "}
          <a
            href="https://www.rand.org/pubs/monograph_reports/MR114.html"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700"
          >
            Assumption-Based Planning (RAND)
          </a>
        </p>
      </div>
    </div>
  );
}
