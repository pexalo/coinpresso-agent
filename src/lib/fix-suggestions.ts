// ---------------------------------------------------------------------------
// What to type in the box, suggested from the rejection itself.
//
// A rejection tells the operator what is wrong. It does not tell them what to
// write to get past it, and the difference matters: "2 internal links to
// coinpresso.io (needs 3-5)" is a diagnosis, while "here are the three pages
// this post should link to" is a fix. Retrying without the second one buys the
// same rejection at the same price, which is exactly what has been happening.
//
// Matched by pattern, not by a model call. Every message below is thrown by a
// named check in writer.ts, so the mapping is a lookup rather than a guess —
// and a lookup costs nothing, returns instantly, and cannot invent a remedy
// for a rejection it has not seen. An unmatched rejection returns null and the
// operator gets an empty box, which is honest.
//
// SCOPE DEFAULTS TO THIS POST, for every one of these, and the reason is
// worth keeping. Each suggestion answers a check the writer already runs, so
// the rule it restates is already in force on every post — "keep paragraphs
// under 125 words" is enforced in code, and saving it again as a house rule
// puts a second copy of an existing rule into every prompt. The first version
// of this table defaulted several to "every post"; one run's retries then
// wrote the same generic sentence into the standing rules four times, beside
// Liam's own words. What a note adds is the SPECIFICS for this article: which
// pages to link, which sentence to cut. Specifics are per post.
//
// "Every post" stays available on each row for the case where an operator
// writes something the checks do not already say.
// ---------------------------------------------------------------------------

export interface FixSuggestion {
  /** Which check fired, for tests and telemetry. */
  id: string;
  /** The cause in one plain line, above the box. */
  cause: string;
  /** A draft instruction, pre-filled into the box and editable. */
  note: string;
  /** Where this usually belongs. */
  scope: "run" | "standing";
  /** Shown under the radio when the recommendation is not obvious. */
  why: string;
  /** The panel should offer the approved page list and add the ticked ones to the note. */
  wantsPages?: boolean;
}

interface Rule {
  id: string;
  test: RegExp;
  cause: string;
  /** May use $1, $2… from the match, so the note can quote the real text. */
  note: string;
  scope: "run" | "standing";
  why: string;
  wantsPages?: boolean;
}

/**
 * Order matters: the first match wins, so the specific patterns come before
 * the general ones. "anchor text has to name where it goes" must be tried
 * before the generic "Linking:" catch-all or every link fault reads the same.
 */
const RULES: Rule[] = [
  {
    id: "anchor-names-destination",
    test: /the anchor "([^"]+)" points at the ([^—]+?) page — the anchor text has to name where it goes/,
    cause: `The anchor "$1" does not say where it leads. This is now fixed automatically — seeing it means the fix did not catch this shape, so the note below tells the writer directly.`,
    note: `When you link to the $2 page, the anchor has to name it. Use wording a reader would recognise as that page — for example "our $2 service" or "$2 for crypto" — not a phrase from the sentence that happens to sit there. Keep it to a short clickable phrase and leave the rest of the claim outside the link.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "invented-page",
    test: /"([^"]+)" is not a page on coinpresso\.io/,
    cause: `The writer linked to $1, which does not exist. It can only link pages it was given.`,
    note: `Do not link $1 — it is not a real page. Link only the coinpresso.io pages supplied in the brief. If the point needs a page that does not exist, make the point without a link.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "internal-links-short",
    test: /(\d+) internal links? to coinpresso\.io \(needs 3-5\)/,
    cause: `Only $1 internal link(s). The house minimum is three, and the writer could not find more that fit. Pick the pages below and the note names them.`,
    // Filled in by the panel from the pages the operator ticks. The writer can
    // only link pages on the approved list, so a note naming anything else
    // would be rejected as an invented URL on the next attempt.
    note: `Link these coinpresso.io pages in this post, with anchor text that names each one, in the sections where they are genuinely relevant. Do not add a links paragraph at the end.`,
    scope: "run",
    why: "About this post — the writer already knows the minimum; what it lacks is which pages.",
    wantsPages: true,
  },
  {
    id: "internal-links-many",
    test: /(\d+) internal links \(the client asked for 3-5 — more reads as stuffing\)/,
    cause: `$1 internal links — over the cap, so it reads as stuffing rather than helping.`,
    note: `Keep at most five internal links. Drop the ones that are least relevant to the section they sit in, and keep the ones a reader would actually click.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "external-links",
    test: /(\d+) external links? \((?:needs|the client asked for)/,
    cause: `$1 external link(s) — the post is not citing enough of the research it was given.`,
    note: `Cite more of the sources in the ledger. Every figure, date, policy change or claim about what a platform does should link to the source it came from. Do not cite anything that is not in the ledger.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "machine-written",
    // Not anchored on "Retry the writer." — that trailer is stripped when
    // several faults are joined into one numbered list, and a pattern that
    // depends on it silently stops matching the moment a draft has two
    // problems instead of one.
    test: /reads as machine-written: ([^\n]*?)\.?\s*(?:Retry the writer\.)?\s*$/m,
    cause: `Flagged as machine-written: $1.`,
    note: `Never open a sentence with "It's worth noting", "It's important to note", "That said", "Moreover", "Furthermore", "In today's landscape" or any similar connector. Start with the subject and say the thing. If two ideas need joining, join them with a full stop and let the next sentence carry the turn.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "closer-repeat",
    test: /The piece ends "([^"]{0,120})/,
    cause: `The closer repeats the "second opinion / conversation worth having" ending that four of the first seven posts used.`,
    note: `End this post with a specific, named action instead. Pick one: a direct offer naming the service, a dare ("open your homepage source tonight and count…"), a callback to the opening image, or a priority list of what to do first. No invitation to "start a conversation", and no offer of a "second opinion".`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "opener-repeat",
    test: /The piece opens "([^"]{0,120})/,
    cause: `The opening repeats the "an AI engine will not mention you" pattern already used several times.`,
    note: `Open this post differently. Lead with the concrete situation the reader is in, a specific number from the research, or the mistake they have probably already made. Do not open with what an AI engine will or will not do.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "intro-length",
    test: /The introduction is (\d+) words; the house runs about 190 and the floor is 110/,
    cause: `The introduction is $1 words. The house runs about 190, with a floor of 110.`,
    note: `Write a fuller introduction — two paragraphs, about 190 words, before the first H2. Set out the situation, name what the post will settle, and give the reader a reason to keep going.`,
    scope: "run",
    why: "About this post.",
  },
  {
    id: "intro-shape",
    test: /Two paragraphs before the first H2 that talk to the reader/,
    cause: `The piece goes straight into a heading with no introduction.`,
    note: `Before the first H2, write two paragraphs addressed to the reader that set the scene and say what this post settles.`,
    scope: "run",
    why: "About this post.",
  },
  {
    id: "outline-mismatch",
    test: /produced (\d+) H2 sections but the client's brief specifies (\d+)/,
    cause: `The writer produced $1 sections; the brief asks for $2.`,
    note: `Use exactly the sections in the brief, in that order, with those headings. If one of them genuinely has nothing to say, tell me which and why rather than merging or dropping it.`,
    scope: "run",
    why: "About this post.",
  },
  {
    id: "paragraph-size",
    test: /paragraphs? (?:is|are) over (\d+) words/,
    cause: `At least one paragraph runs past $1 words — the client's note was "lots of big sections of text".`,
    note: `Break every paragraph that runs long. One idea per paragraph, and a break wherever the argument turns.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "link-spacing",
    test: /pairs? of links sit less than (\d+) words apart/,
    cause: `Two links sit closer than $1 words — the client's note was "a lot of links stuffed together".`,
    note: `Scatter the links. Put no more than one in any given paragraph, and space them across the whole post rather than clustering them in one section.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "sentence-variety",
    test: /stretch(?:es)? of more than (\d+) short sentences in a row/,
    cause: `More than $1 short sentences run together — the client called this "short, snappy sentences" and disliked it.`,
    note: `Vary the sentence length. After two or three short ones, write a longer sentence that carries a full thought, so the rhythm does not turn staccato.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "promised-structure",
    test: /refers to (.+?) but never renders one in markdown/,
    cause: `The post promises $1 and then does not draw one.`,
    note: `If the text says there is a table or a checklist, render it as real markdown in that spot. If it is not worth drawing, take the sentence that promises it out.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "ledger-markers",
    test: /cites with (\d+) ledger markers?/,
    cause: `The draft left $1 internal ledger marker(s) in the published text.`,
    note: `Do not write source markers such as [S1] or [source 3] into the article. Cite by linking the anchor text to the source URL instead.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
  {
    id: "truncated",
    test: /reply was cut off at the (\d+) token limit/,
    cause: `The model hit its output limit at $1 tokens before finishing. This is a length fault, not an editorial one.`,
    note: `Write a shorter article — stay at the low end of the word target and keep every section tight.`,
    scope: "run",
    why: "About this post.",
  },
  {
    id: "anchor-length",
    test: /anchor text longer than (\d+) words/,
    cause: `An anchor runs past $1 words. This is now shortened automatically — seeing it means the automatic fix did not catch this shape.`,
    note: `Keep link text to the short phrase a reader would click, and leave the rest of the sentence outside the brackets.`,
    scope: "run",
    why: "Already a house rule — the note adds what is specific to this post.",
  },
];

function build(r: Rule, m: RegExpMatchArray): FixSuggestion {
  const fill = (s: string) =>
    s.replace(/\$(\d)/g, (_, d: string) => (m[Number(d)] ?? "").trim());
  return {
    id: r.id,
    cause: fill(r.cause),
    note: fill(r.note),
    scope: r.scope,
    why: r.why,
    ...(r.wantsPages ? { wantsPages: true } : {}),
  };
}

/**
 * Every fault in the rejection, in the order the rules are declared.
 *
 * A rejection now carries the whole list — the writer runs all its checks and
 * reports all of them — so matching only the first would throw away exactly
 * the information that stops the operator fixing one thing at a time.
 *
 * One suggestion per rule even when a rule matches several times: three badly
 * named anchors are one instruction about naming anchors, not three.
 */
export function suggestFixes(rejection: string): FixSuggestion[] {
  if (!rejection) return [];
  const out: FixSuggestion[] = [];
  for (const r of RULES) {
    const m = rejection.match(r.test);
    if (m) out.push(build(r, m));
  }
  return out;
}

/** The first fault only. Kept for callers that want a single answer. */
export function suggestFix(rejection: string): FixSuggestion | null {
  return suggestFixes(rejection)[0] ?? null;
}

/** Every rule id, so a test can assert the table has not lost one. */
export const SUGGESTION_IDS = RULES.map((r) => r.id);
