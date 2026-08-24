import { MODELS } from "@/lib/models";
import { PUBLICATION_LIST } from "@/lib/publications";

export const dynamic = "force-dynamic";

const AGENTS = [
  {
    name: "Strategy",
    role: "Researches the market and builds the source ledger",
    model: MODELS.strategy,
    tools: ["web search"],
    tone: "var(--accent)",
    does: [
      "Finds a real, dated news catalyst from the last week or so",
      "Retrieves at least two independent third-party price forecasts, deliberately spread between bullish and cautious",
      "Records the exact figures each source states, so the reviewer can catch drift",
      "Verifies the presale figure, or marks it unverified rather than guessing",
      "Returns a structured brief: catalyst, market context, forecasts, opportunity gap, Moonberg angle, suggested H2s, FAQ candidates, risk notes",
    ],
    why: "The research is the factual floor. Anything missing here cannot appear downstream, because the writer is barred from introducing sources of its own. A weak brief produces a well-written article about nothing.",
  },
  {
    name: "Writer",
    role: "Drafts to house style and the wire's format",
    model: MODELS.writer,
    tools: [],
    tone: "var(--success)",
    does: [
      "Works only from the source ledger — no external URL, publisher, analyst or figure may be introduced",
      "Follows the parasitic-SEO framework: market event first, Moonberg as the conclusion the analysis produces",
      "Respects the pacing rule — three to four intro paragraphs before the prediction section",
      "Applies the wire's link style, length, FAQ count, dateline and boilerplate",
      "On a revision pass, changes only what the reviewer's findings require",
    ],
    why: "Deliberately mid-tier. Given a complete brief and a tight framework, the writing task is constrained enough that a frontier model buys very little — the thinking already happened upstream.",
  },
  {
    name: "Link check",
    role: "Verifies every citation",
    model: "deterministic — not a model",
    tools: ["HTTP"],
    tone: "var(--warning)",
    does: [
      "Extracts every URL from the draft, including inside FAQ answers",
      "Compares each against the research ledger, ignoring tracking parameters",
      "Requests each one and records the status",
      "Feeds anything flagged back into the revision loop as a blocker",
    ],
    why: "A fabricated citation looks exactly like a real one until someone clicks it, and asking a model whether it invented a URL sometimes gets a confident no. String comparison and an HTTP request cannot be talked round.",
  },
  {
    name: "Reviewer",
    role: "Judges the draft against the house style profile",
    model: MODELS.reviewer,
    tools: [],
    tone: "var(--ink-2)",
    does: [
      "Scores style match, sourcing, structure, SEO and compliance",
      "Checks the primary keyword in each required position",
      "Checks the pacing rule and the presence of a cautious counter-forecast",
      "Returns findings graded blocker, major or minor, each with a concrete fix",
      "Sends the draft back when a blocker or three majors are present",
    ],
    why: "A different model family from the writer, on purpose. A reviewer sharing the writer's lineage shares its blind spots and largely agrees with itself.",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Agents</h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-2xl">
          Four stages between a title and a wire-ready draft. Each one exists
          because of a specific way this kind of content goes wrong.
        </p>
      </div>

      <div className="card p-5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-3">
          Pipeline
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {["Brief", "Strategy", "Writer", "Link check", "Reviewer", "Revision", "Liam"].map(
            (s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-md border ${
                    s === "Brief" || s === "Liam"
                      ? "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-3)]"
                      : "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                  }`}
                >
                  {s}
                </span>
                {i < arr.length - 1 && <span className="text-[var(--line)]">→</span>}
              </span>
            )
          )}
        </div>
        <p className="text-[11px] text-[var(--ink-3)] mt-3 leading-relaxed max-w-2xl">
          The revision loop is bounded at two passes. Two models disagreeing on
          taste will otherwise argue until the budget is gone — when the bound is
          hit the run lands in review with its outstanding findings attached, and
          a human decides.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {AGENTS.map((a) => (
          <div key={a.name} className="card p-5">
            <div className="flex items-center gap-2.5 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: a.tone }}
              />
              <h2 className="font-bold text-sm">{a.name}</h2>
            </div>
            <p className="text-[12px] text-[var(--ink-2)]">{a.role}</p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]">
                {a.model}
              </span>
              {a.tools.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]"
                >
                  {t}
                </span>
              ))}
            </div>
            <ul className="mt-4 space-y-1.5">
              {a.does.map((d) => (
                <li
                  key={d}
                  className="text-[11.5px] text-[var(--ink-2)] leading-relaxed pl-3.5 relative"
                >
                  <span className="absolute left-0 text-[var(--ink-4)]">—</span>
                  {d}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-4 pt-4 border-t border-[var(--line)]">
              {a.why}
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">Publication formats</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            Each wire has a house shape. Getting these wrong is the most visible
            failure mode.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium px-5 py-2.5">Wire</th>
                <th className="text-left font-medium px-3 py-2.5">Links</th>
                <th className="text-left font-medium px-3 py-2.5">Words</th>
                <th className="text-left font-medium px-3 py-2.5">FAQs</th>
                <th className="text-left font-medium px-3 py-2.5">Structure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {PUBLICATION_LIST.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5 font-medium whitespace-nowrap">
                    {p.name}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] whitespace-nowrap">
                    {p.linkStyle === "naked" ? "Naked URLs" : "Anchor text"}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] whitespace-nowrap">
                    {p.wordTarget[0]}–{p.wordTarget[1]}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] whitespace-nowrap">
                    {p.faqCount[0]}–{p.faqCount[1]}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)] whitespace-nowrap">
                    {p.structure === "listicle"
                      ? "Listicle"
                      : p.structure === "single_asset"
                        ? "Single asset"
                        : "Either"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
