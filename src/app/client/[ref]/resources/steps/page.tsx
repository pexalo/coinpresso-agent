import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, hasModule } from "@/lib/clients";
import type { ModuleId } from "@/lib/clients";

export const dynamic = "force-dynamic";

interface Step {
  title: string;
  detail: string;
  /** What a person actually checks before moving on. */
  check?: string;
  where?: string;
}

interface Procedure {
  module: ModuleId;
  name: string;
  tone: string;
  when: string;
  steps: Step[];
  /** The thing that most often goes wrong in this procedure. */
  pitfall: string;
}

const PROCEDURES: Procedure[] = [
  {
    module: "crypto-pr",
    name: "A wire release",
    tone: "var(--accent)",
    when: "Each release, from brief to a draft ready for a newswire.",
    steps: [
      {
        title: "Check the campaign fact sheet is current",
        detail:
          "Raised total, stage and token price. The brief is stamped with these at submission, so whatever is here is what the article will state.",
        check:
          "Is updatedAt within a day or two? A fact sheet from last week will put last week's raise on a wire.",
        where: "Crypto PR → Campaigns",
      },
      {
        title: "Give it a title, keywords and a wire",
        detail:
          "Three fields. The wire matters more than it looks — link style, length, FAQ count, dateline and boilerplate all differ, and getting them wrong is the most visible failure.",
        check: "Is the primary keyword the one people actually search?",
        where: "Crypto PR → New article",
      },
      {
        title: "Or let the ideas agent propose a batch",
        detail:
          "It reads the archive — angles worked, keywords used and when, wires under-used — and proposes what has been missed. Pick the ones worth running and generate 5, 10, 15 or 20 in one go.",
        check:
          "Read the differentiator on each. It names the specific thing in the archive that proposal avoids repeating.",
        where: "Crypto PR → Ideas",
      },
      {
        title: "Let it run",
        detail:
          "Strategy researches and builds a source ledger, the writer drafts from it, the link checker verifies every URL, the reviewer scores it, and the writer applies findings — up to twice.",
        check:
          "Nothing. Three run at a time; a batch of twenty takes about twenty-five minutes.",
      },
      {
        title: "Read the run",
        detail:
          "Link check first, then review findings, then the source ledger, then the draft.",
        check:
          "Any unsourced URL is a hard stop. Any figure in the draft that is not in the ledger came from nowhere.",
        where: "Crypto PR → the run",
      },
      {
        title: "Approve and export",
        detail:
          "Creates the Google Doc and updates the content calendar, where those are configured.",
        check:
          "You are the gate. Nothing has reached a wire and nothing will until a person sends it.",
      },
    ],
    pitfall:
      "The reviewer judges one article well and sixty articles badly — it cannot see that this is the fifth XRP piece this week unless the archive is populated. Keep the archive current, or the variety problem stays invisible until a wire editor mentions it.",
  },
  {
    module: "own-blog",
    name: "A day of blog posts",
    tone: "var(--success)",
    when: "Daily, five to eight posts on coinpresso.io.",
    steps: [
      {
        title: "Import the style reference, once",
        detail:
          "Pulls the live blog in as examples of how Coinpresso writes. The writer shows itself three of them on every run.",
        check:
          "Re-run it weekly. It updates rather than duplicates, so it is safe to repeat.",
        where: "Coinpresso Blog → Integration",
      },
      {
        title: "Plan the day, not the article",
        detail:
          "The planner spreads across at least three pillars and several formats. Eight posts that are each fine can still be a bad day's publishing, and the spread is only visible in the set.",
        check:
          "Three or more pillars selected. Two or fewer and the other clusters stop growing.",
        where: "Coinpresso Blog → Plan the day",
      },
      {
        title: "Deal with “needs your data”",
        detail:
          "A proposal marked this way is only original if Coinpresso supplies a figure it holds. Left alone, the post is written honestly around the gap.",
        check:
          "If you have the number, put it in the notes. That post becomes the strongest in the set.",
      },
      {
        title: "Generate the set",
        detail:
          "Same pipeline as the wire track, different instructions at every stage — no dateline, no boilerplate, no disclaimer, no price predictions.",
        check:
          "The reviewer's bar is higher here. A post carrying nothing original is a blocker, not a nitpick.",
      },
      {
        title: "Read the day together",
        detail:
          "Open the day view rather than each run. Look at the pillar spread and the format spread across the whole set before reading any single post.",
        check:
          "Would a founder reading three of these in a row think a person wrote them?",
        where: "Coinpresso Blog → Blog queue",
      },
      {
        title: "Send to WordPress",
        detail:
          "Creates a draft in the mapped category with excerpt, slug and tags. Never publishes.",
        check:
          "Publish from WordPress, having read it there. The failure mode of an automated publish is a bad post nobody knew was live.",
      },
    ],
    pitfall:
      "Volume without originality. Five to eight a day is defensible only while each piece carries a named example, a real figure, an honest limitation or a position a competitor would not take. A run of thin posts is the exact pattern that gets a domain demoted, and it will look fine one post at a time.",
  },
  {
    module: "daily-report",
    name: "The daily report",
    tone: "var(--warning)",
    when: "Every weekday morning, before the standup.",
    steps: [
      {
        title: "Connect delivery",
        detail:
          "Telegram bot token and chat id, the send time and which days. The report goes where people already are rather than waiting in a dashboard nobody has open at 08:00.",
        check: "Send the latest real report as a test, not a hello-world.",
        where: "Settings → Telegram",
      },
      {
        title: "Read the anomalies before the numbers",
        detail:
          "What moved against its own trailing average is the story; the totals are context for it.",
        where: "Daily Report",
      },
      {
        title: "Read all three attribution models",
        detail:
          "First-touch, last-touch and all-touch disagree, and which one you read decides which channel looks like it is working.",
        check:
          "If a channel only looks good under one model, say which one when you report it.",
      },
      {
        title: "Check the actions have an owner and a date",
        detail:
          "An action with neither is a note. Yesterday's actions carry forward so nothing quietly disappears.",
      },
    ],
    pitfall:
      "Most of this flow is not built yet — today the module renders a report transcribed from the PDF Coinpresso already produce, and only the dashboard and the Telegram send actually run. The workflow page draws the unbuilt stages dashed rather than pretending otherwise.",
  },
];

export default async function StepsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  const procedures = PROCEDURES.filter((p) => hasModule(client, p.module));

  return (
    <div className="space-y-5 pt-2">
      <div>
        <Link
          href={`/client/${ref}/resources`}
          className="text-[11px] text-[var(--ink-3)] hover:text-[var(--accent)]"
        >
          ← Resources
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight mt-1.5">
          Workflow steps
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          The procedure for each track, with what a person actually checks at
          every gate. The{" "}
          <Link
            href={`/client/${ref}/workflow`}
            className="text-[var(--accent)] font-medium"
          >
            workflow page
          </Link>{" "}
          shows what the machine does; this is what you do.
        </p>
      </div>

      {procedures.map((p) => (
        <div key={p.module} className="card overflow-hidden">
          <div
            className="px-5 py-4 border-b border-[var(--line)]"
            style={{ borderLeft: `3px solid ${p.tone}` }}
          >
            <h2 className="font-extrabold text-sm">{p.name}</h2>
            <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{p.when}</p>
          </div>

          <ol className="divide-y divide-[var(--line)]">
            {p.steps.map((s, i) => (
              <li key={s.title} className="px-5 py-4 flex gap-4">
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${p.tone} 15%, transparent)`,
                    color: p.tone,
                  }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <h3 className="font-bold text-[12.5px]">{s.title}</h3>
                    {s.where && (
                      <span className="text-[10.5px] text-[var(--ink-4)]">
                        {s.where}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-1 max-w-3xl">
                    {s.detail}
                  </p>
                  {s.check && (
                    <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1.5 pl-3 border-l-2 border-[var(--line)] max-w-3xl">
                      <span className="text-[var(--ink-4)] font-medium">
                        Check:{" "}
                      </span>
                      {s.check}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="px-5 py-4 border-t border-[var(--line)] bg-[var(--surface-2)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-1.5">
              What usually goes wrong
            </div>
            <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
              {p.pitfall}
            </p>
          </div>
        </div>
      ))}

      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">
          The rule that applies to all of them
        </h2>
        <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          A person approves. Every track ends in a queue rather than a send, and
          the agents are built to make that review fast rather than to remove it
          — the link check catches fabricated citations before you read a word,
          the reviewer surfaces blockers with the text quoted, and the source
          ledger lets you check any number in about ten seconds. The moment
          approval becomes a formality, the gates are decoration.
        </p>
      </div>
    </div>
  );
}
