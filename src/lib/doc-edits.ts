// ---------------------------------------------------------------------------
// What the reviewer changed in the Doc, as before/after pairs.
//
// Liam rewrote an opening paragraph by hand — the "oops-a-daisy" version —
// and the next run of the same post came back with the agent's original,
// because nothing on this side ever read his edit. His words: "the feedback
// was evidently input, just missing the intricacies with text." Comments
// reach us; edits to the text itself did not.
//
// This reads the Doc back, lines its paragraphs up against what the pipeline
// exported, and returns every paragraph he changed as a pair. Pure — the
// diff takes two strings and returns pairs — so the alignment is testable
// without a Google account. The route in api/…/doc-edits fetches the Doc and
// calls this; the panel on the run page lets a person tick which pairs become
// house rules and whether the draft itself takes his text.
// ---------------------------------------------------------------------------

export interface EditPair {
  /** What the pipeline wrote, as plain words — for display and matching. */
  before: string;
  /** What the reviewer changed it to, as plain words. */
  after: string;
  /** His paragraph as markdown, links and bold intact — what goes into the draft. */
  afterRaw: string;
  /** How different, 0..1 — 1 is a rewrite, near 0 is a typo fix. */
  distance: number;
  /** The section heading the paragraph sits under, when known. */
  section?: string;
  /**
   * "edit" rewrites a paragraph; "delete" removes one he cut; "insert" adds
   * one he wrote. Missing means "edit". Before this, a cut paragraph stayed
   * in the app's draft while the Doc no longer had it.
   */
  op?: "edit" | "delete" | "insert" | "faq";
  /** For op "faq": which FAQ (by position) and which half changed. */
  faqIndex?: number;
  faqField?: "q" | "a";
  /** For an insert: the plain text of the paragraph it follows ("" = top). */
  afterOf?: string;
}

export const norm = (s: string) =>
  s
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "") // list marker
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/[*_`#>|]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Paragraphs worth comparing: prose, not headings, table rows or blank. */
function paragraphsOf(text: string): Array<{ text: string; raw: string; section?: string }> {
  const out: Array<{ text: string; raw: string; section?: string }> = [];
  let section: string | undefined;
  for (const raw of text.split(/\n{2,}|\n(?=#)/)) {
    const t = raw.trim();
    if (!t) continue;
    const h = t.match(/^(#{1,6})\s+(.*)$/m);
    if (h) {
      // The H1 is the title, not a section; the intro has no section.
      // Only an H2 starts a section: FAQ questions are H3s, and letting them
      // become sections put every answer in a section of its own — so the
      // Doc's answers (all under "FAQs") could never pair with ours.
      if (h[1].length === 2) section = h[2].trim();
      const rest = t.replace(/^#{1,6}\s+.*$/m, "").trim();
      if (!rest) continue;
      out.push({ text: norm(rest), raw: rest, section });
      continue;
    }
    if (t.startsWith("|")) continue;
    // A Doc paragraph that lost its blank lines can hold several of ours.
    for (const piece of t.split(/\n/)) {
      const n = norm(piece);
      if (n.length > 20) out.push({ text: n, raw: piece.trim(), section });
    }
  }
  return out;
}

/** The links in a paragraph, so a link added or changed counts as an edit. */
const linksOf = (raw: string) =>
  [...raw.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => `${m[1].trim()}>${m[2]}`).join("|");
const sectionKey = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const FAQ_HEADING = /^##\s+FAQs?\s*$/im;

/** Everything before the FAQ block, and the FAQ block itself. */
function splitFaqBlock(text: string): { body: string; faq: string } {
  const m = text.match(FAQ_HEADING);
  if (!m || m.index === undefined) return { body: text, faq: "" };
  return { body: text.slice(0, m.index), faq: text.slice(m.index + m[0].length) };
}

/**
 * Question/answer pairs out of a rendered FAQ block.
 *
 * Both shapes count, because the Docs exported before 21 Sep write the
 * question as a bold paragraph and the ones after write it as an H3:
 *
 *     ### Is a holder a member?      **Is a holder a member?**
 *     No. A wallet is a balance.     No. A wallet is a balance.
 */
export function faqPairs(faqBlock: string): Array<{ q: string; a: string; aRaw: string }> {
  const out: Array<{ q: string; a: string; aRaw: string }> = [];
  for (const raw of faqBlock.split(/\n{2,}|\n(?=#)/)) {
    const t = raw.trim();
    if (!t) continue;
    const h3 = t.match(/^#{3,6}\s+(.+)$/s);
    const bold = t.match(/^\*\*(.+?)\*\*[.:]?$/s);
    const q = h3?.[1] ?? bold?.[1];
    if (q) {
      out.push({ q: norm(q), a: "", aRaw: "" });
      continue;
    }
    if (!out.length) continue;
    const last = out[out.length - 1];
    last.a = last.a ? `${last.a} ${norm(t)}` : norm(t);
    last.aRaw = last.aRaw ? `${last.aRaw} ${t}` : t;
  }
  return out.filter((p) => p.q);
}

/** Word-level similarity, 0..1. Cheap and good enough to align paragraphs. */
export function similarity(a: string, b: string): number {
  const wa = a.toLowerCase().split(/\s+/).filter(Boolean);
  const wb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const bag = new Map<string, number>();
  for (const w of wa) bag.set(w, (bag.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wb) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      shared++;
      bag.set(w, n - 1);
    }
  }
  return (2 * shared) / (wa.length + wb.length);
}

/**
 * Every paragraph the reviewer changed.
 *
 * A heavy rewrite of one paragraph shares few words with the original —
 * Liam's "oops-a-daisy" opening keeps about a quarter of the words it
 * replaced — so similarity alone reads it as a different paragraph and
 * drops the one edit that matters most. Order is the other signal: the
 * paragraphs come back in the sequence they were written. So paragraphs
 * that clearly match become anchors, and between two anchors the leftovers
 * are paired by position when the counts agree, by similarity when they do
 * not. What pairs and differs is what he rewrote.
 */
export function diffEdits(
  exported: string,
  current: string,
  opts: { same?: number; anchor?: number; floor?: number } = {}
): EditPair[] {
  const same = opts.same ?? 0.97;
  const anchorAt = opts.anchor ?? 0.6;
  const floor = opts.floor ?? 0.3;
  const exportedSplit = splitFaqBlock(exported);
  const currentSplit = splitFaqBlock(current);
  const ours = paragraphsOf(exportedSplit.body);
  const theirs = paragraphsOf(currentSplit.body);

  // 1. Anchors: strong matches, in order, each side used once.
  const anchors: Array<[number, number]> = [];
  let j0 = 0;
  for (let i = 0; i < ours.length; i++) {
    let best = -1;
    let bestSim = 0;
    for (let j = j0; j < theirs.length; j++) {
      const sim = similarity(ours[i].text, theirs[j].text);
      if (sim > bestSim) {
        bestSim = sim;
        best = j;
      }
    }
    if (best >= 0 && bestSim >= anchorAt) {
      anchors.push([i, best]);
      j0 = best + 1;
    }
  }

  // 2. Between anchors, pair the leftovers.
  const pairs: Array<[number, number]> = [];
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [ours.length, theirs.length]];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const [i0, jA] = bounds[b];
    const [i1, jB] = bounds[b + 1];
    const oi = Array.from({ length: i1 - i0 - 1 }, (_, k) => i0 + 1 + k);
    const tj = Array.from({ length: jB - jA - 1 }, (_, k) => jA + 1 + k);
    if (!oi.length || !tj.length) continue;
    // Only ever pair within the same section: a paragraph cut from one
    // section and a caption added to the next are not a rewrite of each other.
    const same = (i: number, j: number) => sectionKey(ours[i].section) === sectionKey(theirs[j].section);
    if (oi.length === tj.length && oi.every((i, k) => same(i, tj[k]))) {
      oi.forEach((i, k) => pairs.push([i, tj[k]]));
      continue;
    }
    const used = new Set<number>();
    for (const i of oi) {
      let best = -1;
      let bestSim = 0;
      for (const j of tj) {
        if (used.has(j) || !same(i, j)) continue;
        const sim = similarity(ours[i].text, theirs[j].text);
        if (sim > bestSim) {
          bestSim = sim;
          best = j;
        }
      }
      if (best >= 0 && bestSim >= floor) {
        used.add(best);
        pairs.push([i, best]);
      }
    }
  }

  // 3. Anchors that are close but not identical are edits too.
  for (const [i, j] of anchors) {
    // Any change at all is his to keep — "five areas" to "four areas" is one word.
    if (ours[i].text !== theirs[j].text || linksOf(ours[i].raw) !== linksOf(theirs[j].raw)) {
      pairs.push([i, j]);
    }
  }

  const edits: EditPair[] = pairs
    .filter(([i, j]) => ours[i].text !== theirs[j].text || linksOf(ours[i].raw) !== linksOf(theirs[j].raw))
    .sort((a, b) => a[0] - b[0])
    .map(([i, j]) => ({
      before: ours[i].text,
      after: theirs[j].text,
      afterRaw: theirs[j].raw,
      distance: Number((1 - similarity(ours[i].text, theirs[j].text)).toFixed(2)),
      section: ours[i].section,
    }))

  // 4. What is left over on either side was cut or added.
  const all = [...anchors, ...pairs];
  const pairedOurs = new Set(all.map(([i]) => i));
  const pairedTheirs = new Set(all.map(([, j]) => j));
  ours.forEach((p, i) => {
    if (pairedOurs.has(i)) return;
    edits.push({ before: p.text, after: "", afterRaw: "", distance: 1, section: p.section, op: "delete" });
  });
  theirs.forEach((p, j) => {
    if (pairedTheirs.has(j)) return;
    // The nearest paragraph of ours that sits before it in his Doc.
    let prev = -1;
    for (const [i, jj] of all) if (jj < j && i > prev) prev = i;
    edits.push({
      before: "",
      after: p.text,
      afterRaw: p.raw,
      distance: 1,
      section: p.section,
      op: "insert",
      afterOf: prev >= 0 ? ours[prev].text : "",
    });
  });
  // The FAQ block is matched pair by pair, not paragraph by paragraph: five
  // identical placeholder answers have nothing for a similarity match to grip,
  // and the question is an H3 on one side and a bold line on the other.
  const oursFaq = faqPairs(exportedSplit.faq);
  const theirsFaq = faqPairs(currentSplit.faq);
  for (let i = 0; i < Math.min(oursFaq.length, theirsFaq.length); i++) {
    const a = oursFaq[i];
    const b = theirsFaq[i];
    // Position is the default pairing; a question that moved is found by text.
    const j = a.q === b.q ? i : theirsFaq.findIndex((x) => similarity(x.q, a.q) >= 0.7);
    const them = j >= 0 ? theirsFaq[j] : b;
    if (them.q !== a.q) {
      edits.push({ before: a.q, after: them.q, afterRaw: them.q, distance: Number((1 - similarity(a.q, them.q)).toFixed(2)), section: "FAQs", op: "faq", faqIndex: i, faqField: "q" });
    }
    if (them.a !== a.a) {
      edits.push({ before: a.a, after: them.a, afterRaw: them.aRaw, distance: Number((1 - similarity(a.a, them.a)).toFixed(2)), section: "FAQs", op: "faq", faqIndex: i, faqField: "a" });
    }
  }

  return edits;
}

// ---------------------------------------------------------------------------
// Putting his text into the draft.
// ---------------------------------------------------------------------------

export interface DraftLike {
  body: string;
  faqs: Array<{ q: string; a: string }>;
}

/**
 * Replace each paragraph he rewrote with his version, markdown and all.
 *
 * Matched on the plain words, because the Doc never shows markdown and the
 * draft always does: the first version searched the draft for his plain
 * text, so any paragraph that had held a link was never found and his edit
 * was silently dropped. Now each draft line is normalised the same way the
 * diff saw it, and the best match above 0.9 is replaced. A list item keeps
 * its marker. FAQ answers and questions are matched the same way.
 */
export function applyEdits<T extends DraftLike>(
  draft: T,
  edits: EditPair[]
): { draft: T; applied: number; missed: EditPair[] } {
  const blocks = draft.body.split(/(\n{2,})/);
  const faqs = draft.faqs.map((f) => ({ ...f }));
  // Five identical placeholder answers must not all match FAQ #1. Each answer
  // is claimed once, in order.
  const usedFaq = new Set<number>();
  let applied = 0;
  const missed: EditPair[] = [];

  // A Doc that reads back with most of the post missing is a bad read, not
  // an edit: never delete on that evidence.
  const deletes = edits.filter((e) => e.op === "delete").length;
  const lines = draft.body.split("\n").filter((l) => norm(l).length > 20).length;
  const trustDeletes = deletes <= Math.max(2, lines * 0.3);

  const findLine = (text: string) => {
    let best: { b: number; l: number; sim: number } | null = null;
    blocks.forEach((block, b) => {
      if (b % 2) return;
      block.split("\n").forEach((line, l) => {
        if (/^\s*#/.test(line) || /^\s*\|/.test(line)) return;
        const sim = similarity(norm(line), text);
        if (sim >= 0.9 && (!best || sim > best.sim)) best = { b, l, sim };
      });
    });
    return best as { b: number; l: number; sim: number } | null;
  };

  for (const e of edits) {
    if (e.op === "faq") {
      const i = e.faqIndex ?? -1;
      if (i < 0 || i >= faqs.length) {
        missed.push(e);
        continue;
      }
      if (e.faqField === "q") faqs[i].q = e.afterRaw.replace(/^\*\*|\*\*$/g, "");
      else faqs[i].a = e.afterRaw;
      applied++;
      continue;
    }
    if (e.op === "delete") {
      const hit = trustDeletes ? findLine(e.before) : null;
      if (!hit) {
        const f = trustDeletes ? faqs.findIndex((x, k) => !usedFaq.has(k) && similarity(norm(x.a), e.before) >= 0.9) : -1;
        if (f >= 0) {
          faqs.splice(f, 1);
          applied++;
        } else missed.push(e);
        continue;
      }
      const ls = blocks[hit.b].split("\n");
      ls.splice(hit.l, 1);
      blocks[hit.b] = ls.join("\n");
      applied++;
      continue;
    }
    if (e.op === "insert") {
      if (e.section && /faq/i.test(e.section)) {
        missed.push(e);
        continue;
      }
      if (!e.afterOf) {
        blocks[0] = e.afterRaw + "\n\n" + blocks[0];
        applied++;
        continue;
      }
      // The paragraph it follows may itself have been rewritten a moment ago.
      const renamed = edits.find((x) => (x.op ?? "edit") === "edit" && x.before === e.afterOf);
      const hit = findLine(e.afterOf) ?? (renamed ? findLine(renamed.after) : null);
      if (!hit) {
        // Fall back to the top of its own section.
        const h = e.section
          ? blocks.findIndex((bk, b) => !(b % 2) && /^#{2,6}\s+/.test(bk) && sectionKey(norm(bk.split("\n")[0])) === sectionKey(e.section))
          : -1;
        if (h < 0) {
          missed.push(e);
          continue;
        }
        blocks[h] = blocks[h] + "\n\n" + e.afterRaw;
        applied++;
        continue;
      }
      // First paragraph of a new section: it goes under that heading, not
      // at the end of the section before.
      const headingAt = e.section
        ? blocks.findIndex((bk, b) => !(b % 2) && b > hit.b &&
            new RegExp(`^#{2,6}\\s+`).test(bk) && sectionKey(norm(bk.split("\n")[0])) === sectionKey(e.section))
        : -1;
      const nextHeading = blocks.findIndex((bk, b) => !(b % 2) && b > hit.b && /^#{2,6}\s+/.test(bk));
      const at = headingAt >= 0 && headingAt === nextHeading ? headingAt : hit.b;
      blocks[at] = blocks[at] + "\n\n" + e.afterRaw;
      applied++;
      continue;
    }
    let best: { b: number; l: number; sim: number } | null = null;
    blocks.forEach((block, b) => {
      if (b % 2) return; // separators
      block.split("\n").forEach((line, l) => {
        if (/^\s*#/.test(line) || /^\s*\|/.test(line)) return;
        const sim = similarity(norm(line), e.before);
        if (sim >= 0.9 && (!best || sim > best.sim)) best = { b, l, sim };
      });
    });
    if (best) {
      const { b, l } = best as { b: number; l: number };
      const lines = blocks[b].split("\n");
      const marker = lines[l].match(/^\s*(?:[-*+]|\d+[.)])\s+/)?.[0] ?? "";
      const text = e.afterRaw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
      lines[l] = marker + text;
      blocks[b] = lines.join("\n");
      applied++;
      continue;
    }
    const f = faqs.findIndex((x, k) => !usedFaq.has(k) && similarity(norm(x.a), e.before) >= 0.9);
    if (f >= 0) {
      usedFaq.add(f);
      faqs[f].a = e.afterRaw;
      applied++;
      continue;
    }
    const q = faqs.findIndex((x, k) => !usedFaq.has(k) && similarity(norm(x.q), e.before) >= 0.9);
    if (q >= 0) {
      usedFaq.add(q);
      faqs[q].q = e.afterRaw.replace(/^\*\*|\*\*$/g, "");
      applied++;
      continue;
    }
    missed.push(e);
  }
  const body = blocks.join("").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  return { draft: { ...draft, body, faqs }, applied, missed };
}

/** A light fix — a typo, a word — is not worth a house rule. */
export const RULE_WORTHY_DISTANCE = 0.25;
