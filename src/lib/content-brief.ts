// ---------------------------------------------------------------------------
// Coinpresso's content brief for one post, as structure rather than prose.
//
// The briefs arrive as Google Docs with a consistent shape: a spec table, the
// angle, the gap in what already ranks, what the piece must and must not claim,
// a numbered outline with per-section word counts, the original asset, an FAQ,
// and a linking plan. All of that was previously parsed and then flattened back
// into one 4,000-character string on `notes` — which meant the screen could only
// print a wall of text, and the prompt could only paste one.
//
// Keeping the structure costs nothing and buys two things at once: a brief that
// can be READ on screen (outline as an outline, FAQs as questions, the
// must-not-claim line as a constraint rather than a sentence in a paragraph),
// and a prompt block composed field by field, so the parts that need
// quarantining can be quarantined individually.
//
// `notes` goes back to being what it was for: what a person typed.
// ---------------------------------------------------------------------------

/** One row of the brief's spec table — "Meta title", "Proposed slug", … */
export interface BriefSpecRow {
  label: string;
  value: string;
}

/** One section of the recommended article outline. */
export interface BriefSection {
  n: number;
  title: string;
  focus?: string;
  /** Target length, where the brief gives one. */
  words?: number;
}

export interface BriefFaq {
  q: string;
  a: string;
}

export interface ContentBrief {
  /** Exact title, primary keyword, slug, meta title/description, length… */
  spec?: BriefSpecRow[];
  /** The angle Coinpresso want taken. */
  angle?: string;
  /** What already ranks, and what it leaves out. */
  gap?: string;
  /**
   * Why they think this one can win — and, in the same section of the doc,
   * what it must NOT claim. The second half is the part that prevents a
   * reviewer blocker later, so it is never dropped for length.
   */
  rationale?: string;
  outline?: BriefSection[];
  /** A downloadable or original asset the brief asks for. */
  asset?: string;
  faqs?: BriefFaq[];
  /** Internal links and the call to action. */
  linking?: string;
  /** Which Drive doc this came from, and when it was read. */
  docId?: string;
  importedAt?: string;
  /**
   * True when the research stage wrote this brief because the topic had none.
   * It is built to the same shape as Coinpresso's own briefs — 7 or 9
   * declarative sections, scene-setting opener, "Conclusion and FAQ", five
   * FAQs — so the writer treats both identically. Shown in the UI so a reader
   * knows whether Liam or the agent chose the headings.
   */
  generated?: boolean;
}

/** Enough to label the row in a list of eighty without opening it. */
export function briefSummary(b: ContentBrief | undefined): {
  sections: number;
  faqs: number;
  words?: number;
  hasGuardrails: boolean;
} | null {
  if (!b) return null;
  const words = (b.outline ?? []).reduce((n, s) => n + (s.words ?? 0), 0);
  return {
    sections: b.outline?.length ?? 0,
    faqs: b.faqs?.length ?? 0,
    words: words || undefined,
    hasGuardrails: Boolean(b.rationale),
  };
}

/**
 * The brief as the strategy agent sees it.
 *
 * Two things are stated rather than left to inference, because both have a
 * failure mode that reaches a published page:
 *
 *   THE FIGURES ARE NOT FACTS. The briefs quote market sizes and citation
 *   shares their author found somewhere. Arriving inside a block labelled "from
 *   the client", they read as supplied and verified, and an unsourced number in
 *   a post is exactly how that ends.
 *
 *   THE BRIEF IS NOT A SOURCE. It is an internal Drive document. Neither it nor
 *   the references inside it were retrieved by this pipeline, and the writer may
 *   only cite the research ledger.
 */
export function briefToPrompt(b: ContentBrief | undefined): string {
  if (!b) return "";
  const parts: string[] = [
    `--- COINPRESSO'S CONTENT BRIEF FOR THIS POST ---

This is what the client asked for. Follow it.

Two things about it. Every figure below is a claim made by the brief's author
and is NOT verified — find a retrievable source for one before using it, or
write around it; do not present any of them as established. And the brief itself
is not a source: it is an internal document, it is not published, and neither it
nor anything quoted inside it goes in "sources" unless you retrieved that page
yourself.`,
  ];

  if (b.spec?.length) {
    parts.push(
      `WHAT THEY SPECIFIED\n${b.spec.map((r) => `${r.label}: ${r.value}`).join("\n")}`
    );
  }
  if (b.angle) parts.push(`THE ANGLE THEY WANT\n${b.angle}`);
  if (b.gap) parts.push(`THE GAP THEY FOUND IN WHAT ALREADY RANKS\n${b.gap}`);
  if (b.rationale) {
    parts.push(
      `WHY THEY THINK IT CAN WIN — AND WHAT IT MUST NOT CLAIM\n${b.rationale}`
    );
  }
  if (b.outline?.length) {
    const total = b.outline.reduce((n, s) => n + (s.words ?? 0), 0);
    parts.push(
      `THE STRUCTURE THEY WANT${total ? ` (${total} words across ${b.outline.length} sections)` : ""}\n${b.outline
        .map(
          (s) =>
            `${s.n}. ${s.title}${s.focus ? ` — ${s.focus}` : ""}${
              s.words ? ` (~${s.words} words)` : ""
            }`
        )
        .join("\n")}`
    );
  }
  if (b.asset) parts.push(`THE ORIGINAL ASSET THEY WANT BUILT\n${b.asset}`);
  if (b.faqs?.length) {
    parts.push(
      `QUESTIONS THE POST MUST ANSWER — this is the FAQ block\n${b.faqs
        .map((f) => `${f.q}\n${f.a}`)
        .join("\n\n")}`
    );
  }
  if (b.linking) parts.push(`WHERE IT SHOULD LINK, AND THE CALL TO ACTION\n${b.linking}`);

  return parts.join("\n\n");
}


/**
 * A few of Coinpresso's real brief outlines, for the research stage to imitate
 * when a topic arrives without one.
 *
 * WHY EXEMPLARS AND NOT A DESCRIPTION. The house pattern was described in
 * prose once before — "question-shaped H2s, FAQ block" — and it was wrong, and
 * it stayed wrong for seven articles because a description can drift from the
 * thing it describes without anyone noticing. Three of the client's actual
 * outlines cannot drift; they ARE the pattern. Measured across 74 briefs: 7 or
 * 9 sections, 0% question headings, a scene-setting opener, "Conclusion and
 * FAQ" to close, five FAQs.
 */
export function outlineExemplars(
  briefs: ContentBrief[],
  limit = 3
): string {
  const usable = briefs.filter(
    (b) => !b.generated && b.outline && b.outline.length >= 7 && b.angle
  );
  if (!usable.length) return "";
  // Spread across the list rather than the first three, so one pillar's
  // conventions do not become the whole house's.
  const step = Math.max(1, Math.floor(usable.length / limit));
  const picked = usable.filter((_, i) => i % step === 0).slice(0, limit);
  return `COINPRESSO'S OWN BRIEFS — three real examples of the shape every post takes.
Imitate the SHAPE exactly: section count (7 or 9), a scene-setting first
section, declarative headings that are statements, never questions, and a final
"Conclusion and FAQ". Do not imitate the subject matter.

${picked
  .map(
    (b, k) => `EXAMPLE ${k + 1} — angle: ${b.angle}
${b.outline!.map((s) => `  ${s.n}. ${s.title}`).join("\n")}
  FAQs: ${b.faqs?.length ?? 0}`
  )
  .join("\n\n")}`;
}
