"use client";

import { useEffect, useState } from "react";
import { briefToPrompt } from "@/lib/content-brief";
import type { SeedTopic } from "@/lib/blog-seed";
import { PILLARS } from "@/lib/blog";

/**
 * Coinpresso's content brief for one topic.
 *
 * WHY A DRAWER AND NOT AN EXPANDING CARD. The queue is eighty rows and a brief
 * is four thousand characters. Expanding in place pushes everything below it off
 * screen, so opening a second brief means losing your place in the first — and
 * the actual job here is comparing: is this one specified well enough to write?
 * A drawer keeps the list still, so the arrow keys stay meaningful.
 *
 * WHY TWO TABS. The brief exists for the WRITER — it is the shape and the voice
 * the agent follows before it invents anything of its own. So the screen owes
 * the reader proof that what they are reading is what the model is told, and the
 * second tab is literally `briefToPrompt` output: same function, same string,
 * no second rendering path to drift. A pretty summary of a prompt is worse than
 * no summary, because it reads as verification and is not.
 *
 * ORDER. Not the doc's order — the order a person checking the brief needs:
 * angle first (is this the right piece?), then the constraints (what will get it
 * blocked), then the outline (is this actually an article?), then the FAQ, then
 * the reference material. The spec table is real but it is lookup, so it sits
 * low.
 */
export default function BriefDrawer({
  topic,
  onClose,
  onPark,
  onRequeue,
}: {
  topic: SeedTopic | null;
  onClose: () => void;
  onPark?: (id: string) => void;
  onRequeue?: (id: string) => void;
}) {
  const [tab, setTab] = useState<"brief" | "prompt">("brief");

  // Esc closes, and the body does not scroll behind the panel. Both are the
  // things people try first without thinking about them.
  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [topic, onClose]);

  useEffect(() => setTab("brief"), [topic?.id]);

  if (!topic) return null;

  const b = topic.brief;
  const pillar = PILLARS.find((p) => p.id === topic.pillar);
  const sections = b?.outline?.length ?? 0;
  const words = (b?.outline ?? []).reduce((n, s) => n + (s.words ?? 0), 0);
  const faqs = b?.faqs ?? [];
  // Two-thirds of the briefs give the FAQ questions plus one instruction for
  // how to answer them, repeated. Five identical answers look like a parsing
  // bug unless the screen says what they are.
  const faqIsQuestionsOnly =
    faqs.length > 1 && new Set(faqs.map((f) => f.a)).size === 1;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Content brief: ${topic.topic}`}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[660px] bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl flex flex-col"
      >
        {/* ---- header ------------------------------------------------------ */}
        <header className="shrink-0 border-b border-[var(--line)] px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {pillar && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-2)]">
                    {pillar.name}
                  </span>
                )}
                {topic.status === "parked" && (
                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10">
                    hidden
                  </span>
                )}
                {topic.status === "used" && (
                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10">
                    written {topic.usedAt?.slice(0, 10)}
                  </span>
                )}
              </div>
              <h2 className="text-[16px] font-bold leading-snug">{topic.topic}</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 -mt-1 -mr-1 w-8 h-8 grid place-items-center rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--bg)] transition-colors text-[15px]"
            >
              ✕
            </button>
          </div>

          {b && (
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3 text-[11px] text-[var(--ink-3)]">
              {sections > 0 && <span>{sections} sections</span>}
              {words > 0 && (
                <>
                  <Dot />
                  <span>~{words.toLocaleString()} words</span>
                </>
              )}
              {faqs.length > 0 && (
                <>
                  <Dot />
                  <span>{faqs.length} FAQs</span>
                </>
              )}
              {b.rationale && (
                <>
                  <Dot />
                  <span className="text-[var(--warning)]">has constraints</span>
                </>
              )}
              {topic.referenceUrl && (
                <a
                  href={topic.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-[var(--accent)] font-medium hover:underline underline-offset-2"
                >
                  Edit in Drive ↗
                </a>
              )}
            </div>
          )}

          {b && (
            <div className="mt-3.5 inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--bg)]">
              {(
                [
                  ["brief", "Brief"],
                  ["prompt", "What the writer gets"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-[6px] transition-colors ${
                    tab === id
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ---- body -------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!b ? (
            <NoBrief topic={topic} />
          ) : tab === "prompt" ? (
            <>
              <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mb-3">
                The exact text sent to the research and writing agents, composed
                from the fields on the other tab. Not a summary of it — the same
                function builds both, so this cannot drift from what the model
                actually receives.
              </p>
              <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap bg-[var(--bg)] border border-[var(--line)] rounded-lg p-4 text-[var(--ink-2)]">
                {briefToPrompt(b)}
              </pre>
            </>
          ) : (
            <div className="space-y-6">
              {topic.keywords.length > 0 && (
                <Section title="Target keywords">
                  <div className="flex flex-wrap gap-1.5">
                    {topic.keywords.map((k, i) => (
                      <span
                        key={k}
                        className={`text-[11.5px] px-2 py-1 rounded-md border ${
                          i === 0
                            ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] font-semibold"
                            : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-2)]"
                        }`}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] text-[var(--ink-4)] mt-2">
                    The first is the primary keyword.
                  </p>
                </Section>
              )}

              {b.angle && (
                <Section title="The angle they want">
                  <p className="text-[12.5px] leading-relaxed text-[var(--ink)] border-l-2 border-[var(--accent)] pl-3.5">
                    {b.angle}
                  </p>
                </Section>
              )}

              {b.rationale && (
                <Section title="Why it can win — and what it must not claim">
                  <div className="rounded-lg border border-[var(--warning)]/35 bg-[var(--warning)]/[0.07] p-3.5">
                    <p className="text-[12.5px] leading-relaxed text-[var(--ink)] whitespace-pre-line">
                      {b.rationale}
                    </p>
                  </div>
                </Section>
              )}

              {b.outline?.length ? (
                <Section
                  title="The structure they want"
                  aside={
                    words > 0
                      ? `${b.outline.length} sections · ~${words.toLocaleString()} words`
                      : `${b.outline.length} sections`
                  }
                >
                  <ol className="space-y-0">
                    {b.outline.map((s) => (
                      <li
                        key={s.n}
                        className="flex gap-3 py-2.5 border-b border-[var(--line)] last:border-0"
                      >
                        <span className="shrink-0 w-6 h-6 mt-px grid place-items-center rounded-md bg-[var(--bg)] border border-[var(--line)] text-[10.5px] font-bold tabular-nums text-[var(--ink-3)]">
                          {s.n}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold leading-snug">
                            {s.title}
                          </span>
                          {s.focus && (
                            <span className="block text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-0.5">
                              {s.focus}
                            </span>
                          )}
                        </span>
                        {s.words ? (
                          <span className="shrink-0 text-[10.5px] text-[var(--ink-4)] tabular-nums pt-0.5">
                            {s.words}w
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Section>
              ) : null}

              {faqs.length > 0 && (
                <Section title="Questions the post must answer" aside={`${faqs.length}`}>
                  {faqIsQuestionsOnly && (
                    <p className="text-[11px] text-[var(--ink-4)] leading-relaxed mb-2.5">
                      This brief supplies the questions and one instruction for
                      answering them — not model answers. The writer answers each
                      from the research.
                    </p>
                  )}
                  <ul className="space-y-3">
                    {faqs.map((f, i) => (
                      <li key={i}>
                        <p className="text-[12.5px] font-semibold leading-snug">
                          {f.q}
                        </p>
                        {f.a && !faqIsQuestionsOnly && (
                          <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1">
                            {f.a}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {faqIsQuestionsOnly && faqs[0]?.a && (
                    <p className="text-[11px] text-[var(--ink-4)] italic leading-relaxed mt-3 pt-3 border-t border-[var(--line)]">
                      Instruction given for every answer: {faqs[0].a}
                    </p>
                  )}
                </Section>
              )}

              {b.gap && (
                <Section title="The gap they found in what already ranks">
                  <p className="text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
                    {b.gap}
                  </p>
                </Section>
              )}

              {b.asset && (
                <Section title="The original asset they want built">
                  <p className="text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
                    {b.asset}
                  </p>
                </Section>
              )}

              {b.linking && (
                <Section title="Where it links, and the call to action">
                  <p className="text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
                    {b.linking}
                  </p>
                </Section>
              )}

              {b.spec?.length ? (
                <Section title="What they specified">
                  <dl className="text-[12px]">
                    {b.spec.map((r) => (
                      <div
                        key={r.label}
                        className="flex gap-4 py-1.5 border-b border-[var(--line)] last:border-0"
                      >
                        <dt className="shrink-0 w-[132px] text-[var(--ink-4)]">
                          {r.label}
                        </dt>
                        <dd className="min-w-0 flex-1 text-[var(--ink-2)]">
                          {r.value}
                          {/meta description/i.test(r.label) && (
                            <span
                              className={`ml-2 text-[10.5px] tabular-nums ${
                                r.value.length > 160
                                  ? "text-[var(--warning)]"
                                  : "text-[var(--ink-4)]"
                              }`}
                            >
                              {r.value.length} chars
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              ) : null}

              {topic.notes && (
                <Section title="Note from Coinpresso">
                  <p className="text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
                    {topic.notes}
                  </p>
                </Section>
              )}
            </div>
          )}
        </div>

        {/* ---- footer ------------------------------------------------------ */}
        <footer className="shrink-0 border-t border-[var(--line)] px-6 py-3.5 flex items-center gap-3">
          <p className="text-[10.5px] text-[var(--ink-4)] leading-snug flex-1">
            {b?.importedAt
              ? `Read from the Drive doc on ${b.importedAt.slice(0, 10)}. `
              : ""}
            Guidance the writer follows — never cited as a source.
          </p>
          {topic.status === "queued" && onPark && (
            <button
              onClick={() => onPark(topic.id)}
              className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              Hide
            </button>
          )}
          {topic.status === "parked" && onRequeue && (
            <button
              onClick={() => onRequeue(topic.id)}
              className="text-[11.5px] font-semibold text-[var(--accent)]"
            >
              Re-queue
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

function Dot() {
  return <span className="text-[var(--ink-4)]">·</span>;
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
          {title}
        </h3>
        {aside && (
          <span className="text-[10px] text-[var(--ink-4)] tabular-nums">
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A topic with no brief. Stated plainly rather than as an empty panel, because
 * "no brief" and "the brief failed to import" look identical otherwise, and the
 * fix is different for each.
 */
function NoBrief({ topic }: { topic: SeedTopic }) {
  return (
    <div className="space-y-5">
      {topic.keywords.length > 0 && (
        <Section title="Target keywords">
          <div className="flex flex-wrap gap-1.5">
            {topic.keywords.map((k) => (
              <span
                key={k}
                className="text-[11.5px] px-2 py-1 rounded-md border border-[var(--line)] bg-[var(--bg)] text-[var(--ink-2)]"
              >
                {k}
              </span>
            ))}
          </div>
        </Section>
      )}
      {topic.notes && (
        <Section title="Note from Coinpresso">
          <p className="text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-line">
            {topic.notes}
          </p>
        </Section>
      )}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-4">
        <p className="text-[12px] font-semibold mb-1">No content brief</p>
        <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed">
          {topic.referenceUrl ? (
            <>
              The calendar links a brief for this topic but its contents were
              never read in — the linked file is not a Google Doc, so the
              importer skipped it. The planner will work from the topic and
              keywords alone.
            </>
          ) : (
            <>
              The calendar has no brief for this topic. The planner decides the
              angle, structure and FAQ itself, which is the normal path for a
              topic somebody typed in.
            </>
          )}
        </p>
        {topic.referenceUrl && (
          <a
            href={topic.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2.5 text-[11.5px] font-semibold text-[var(--accent)] hover:underline underline-offset-2"
          >
            Open the linked file ↗
          </a>
        )}
      </div>
    </div>
  );
}
