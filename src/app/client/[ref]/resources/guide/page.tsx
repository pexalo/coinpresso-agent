import Link from "next/link";
import { notFound } from "next/navigation";
import { clientModules, getClient } from "@/lib/clients";
import { keyStatus, mockMode, MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client) notFound();

  const mods = clientModules(client).filter((m) => m.built);
  const keys = keyStatus();
  const mock = mockMode();

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
          Operating guide
        </h1>
        <p className="text-[var(--ink-3)] text-sm mt-1 max-w-3xl">
          What this is, what it deliberately will not do, and how to get from a
          blank queue to something worth sending.
        </p>
      </div>

      {mock && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[12px] text-[var(--warning)]">
          <span className="font-semibold">Running in mock mode.</span> No model
          is being called, no search is performed, and no figure in any output is
          real — the whole pipeline runs so the dashboard is explorable, but
          nothing it produces is publishable.{" "}
          {!keys.anthropic && !keys.openai
            ? "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is usable."
            : !keys.anthropic
              ? "ANTHROPIC_API_KEY is missing or still a placeholder."
              : "OPENAI_API_KEY is missing or still a placeholder."}{" "}
          Add them to <code>.env.local</code> and restart.
        </div>
      )}

      {/* --- What it is --------------------------------------------------- */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-2">What it is</h2>
        <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-3xl">
          A research-and-drafting pipeline with a human gate at the end. You give
          it a title, target keywords and a destination; it researches the market
          with live search, drafts to the house voice, verifies every citation by
          code, has a second model from a different vendor review it against the
          style profile, and leaves the result in a queue for a person.
        </p>
        <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-3xl mt-3">
          It is not a publish button with a model behind it. Every route ends in
          review, and the two things most likely to embarrass a client — an
          invented statistic and a fabricated citation — are handled structurally
          rather than by asking a model to behave.
        </p>
      </div>

      {/* --- What it will not do ------------------------------------------ */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-3">
          What it will not do, on purpose
        </h2>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          {[
            [
              "Publish anything",
              "Wire releases land in the queue as drafts. Blog posts are created in WordPress as drafts. There is no publish path in the code, and no setting that adds one.",
            ],
            [
              "Invent a source",
              "The writer may only cite URLs the research stage actually retrieved. Where a fact is missing the draft says so rather than filling the gap.",
            ],
            [
              "State a presale figure it was not given",
              "Four different raised totals appeared across one published week. The campaign fact sheet is a human input; the agent marks a figure unverified rather than guessing.",
            ],
            [
              "Guarantee an outcome",
              "No guaranteed returns, no confirmed listings, no promised rankings. These are blockers in review, not style notes.",
            ],
            [
              "Pass everything",
              "A reviewer that never rejects is decoration. Sending a draft back is a normal outcome, and the revision loop is bounded at two passes before a human decides.",
            ],
            [
              "Hide a weak run",
              "Mock runs are labelled, unverified figures are labelled, and a cost forecast built on too few runs says it is modelled rather than measured.",
            ],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="text-[12.5px] font-bold">{t}</div>
              <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1">
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* --- Modules ------------------------------------------------------ */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">What {client.name} has</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {mods.map((m) => (
            <div key={m.id} className="px-5 py-4">
              <Link
                href={`/client/${ref}/${m.slug}`}
                className="text-[13px] font-bold hover:text-[var(--accent)] transition-colors"
              >
                {m.name} →
              </Link>
              <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1 max-w-3xl">
                {m.summary}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* --- First hour --------------------------------------------------- */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-3">The first hour</h2>
        <ol className="space-y-3 max-w-3xl">
          {[
            [
              "Put the keys in",
              <>
                <code>ANTHROPIC_API_KEY</code> and <code>OPENAI_API_KEY</code> in{" "}
                <code>.env.local</code>. Check{" "}
                <code>/api/health</code> — it names which one is missing rather
                than only telling you it is in mock mode. Currently{" "}
                {MODELS.strategy} and {MODELS.reviewer}.
              </>,
            ],
            [
              "Set the campaign fact sheet",
              <>
                Campaigns → Moonberg. The raised total, stage and token price
                live here, and every brief is stamped with them at submission so
                a mid-batch change cannot make two articles disagree. Stale is
                visible; wrong is not.
              </>,
            ],
            [
              "Import the style reference",
              <>
                Coinpresso Blog → Integration → Import. Until this runs the
                writer works from a written description of the voice, which gets
                you a post that obeys the description rather than one that sounds
                like Coinpresso.
              </>,
            ],
            [
              "Run one article, not twenty",
              <>
                Crypto PR → New article. Watch it move through the stages, read
                the review findings and the source ledger. The point of the first
                run is to see where the gates are, not to get a publishable
                draft.
              </>,
            ],
            [
              "Then plan a day",
              <>
                Coinpresso Blog → Plan the day, or Crypto PR → Ideas. Both read
                what already exists and propose from the gaps. Generate the ones
                worth running as a batch.
              </>,
            ],
          ].map(([t, d], i) => (
            <li key={i} className="pl-7 relative">
              <span className="absolute left-0 font-bold text-[var(--accent)] text-[13px]">
                {i + 1}.
              </span>
              <div className="text-[12.5px] font-bold">{t}</div>
              <p className="text-[11.5px] text-[var(--ink-2)] leading-relaxed mt-0.5">
                {d}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* --- Reading a run ------------------------------------------------ */}
      <div className="card p-5">
        <h2 className="font-bold text-sm mb-3">Reading a finished run</h2>
        <p className="text-[12px] text-[var(--ink-2)] leading-relaxed max-w-3xl mb-3">
          Four things are on the run page, and they are worth reading in this
          order — the draft last.
        </p>
        <div className="space-y-3 max-w-3xl">
          {[
            [
              "Link check",
              "Anything listed as unsourced or unreachable is a hard problem, not a style note. Unsourced means the writer produced a URL the research never retrieved.",
            ],
            [
              "Review findings",
              "Blockers first. A blocker is a claim that cannot publish — an invented figure, a guaranteed return, a missing disclaimer. Majors are off-brand. Minors are polish.",
            ],
            [
              "Source ledger",
              "Every citation the article is allowed to make, with the figures each source actually states. If a number in the draft is not in here, it came from nowhere.",
            ],
            [
              "The draft",
              "Read it last, once you know what the machine already caught. Read it as the reader would — a trader deciding where to put money, or a founder deciding whether to hire you.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3">
              <div className="text-[12px] font-bold w-28 shrink-0">{t}</div>
              <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed">
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* --- When it goes wrong ------------------------------------------- */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-bold text-sm">When something looks wrong</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
                <th className="text-left font-medium px-5 py-2.5">Symptom</th>
                <th className="text-left font-medium px-5 py-2.5">
                  Usually this
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[
                [
                  "Everything says “mock”",
                  "No usable model key. /api/health names the missing one. A placeholder like sk-ant-… counts as missing on purpose — otherwise the app 401s three minutes into a run instead of saying it has no keys.",
                ],
                [
                  "Drafts sound generic",
                  "The style exemplar block is empty. Import the blog on the Integration page, and paste article bodies into the wire archive. Two real examples beat any amount of style guide.",
                ],
                [
                  "The reviewer rejects everything",
                  "Usually a campaign fact sheet that is blank, so every stated figure is unverified and therefore a blocker. Fill it in.",
                ],
                [
                  "A batch is slow",
                  "Three run at once by design. Twenty in parallel would hit provider rate limits and return a wall of failures. Twenty articles is roughly twenty-five minutes.",
                ],
                [
                  "The cost forecast looks wrong",
                  "Check whether it says modelled or measured. Under five real runs on a track it is arithmetic on estimated prompt sizes, not history.",
                ],
                [
                  "Ideas repeat what we ran last week",
                  "The archive is what it reads. If runs were generated outside this system they are not in it, so it cannot see them.",
                ],
              ].map(([s, f]) => (
                <tr key={s}>
                  <td className="px-5 py-3 font-medium align-top w-56">{s}</td>
                  <td className="px-5 py-3 text-[var(--ink-2)] align-top leading-relaxed">
                    {f}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/client/${ref}/resources/steps`}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Workflow steps →
        </Link>
        <Link
          href={`/client/${ref}/workflow`}
          className="text-[12.5px] font-semibold px-4 py-2.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors"
        >
          See the pipelines drawn
        </Link>
      </div>
    </div>
  );
}
