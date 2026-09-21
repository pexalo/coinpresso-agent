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
      if (h[1].length >= 2) section = h[2].trim();
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
  const floor = opts.floor ?? 0.12;
  const ours = paragraphsOf(exported);
  const theirs = paragraphsOf(current);

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
    if (oi.length === tj.length) {
      oi.forEach((i, k) => pairs.push([i, tj[k]]));
      continue;
    }
    const used = new Set<number>();
    for (const i of oi) {
      let best = -1;
      let bestSim = 0;
      for (const j of tj) {
        if (used.has(j)) continue;
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
    if (similarity(ours[i].text, theirs[j].text) < same) pairs.push([i, j]);
  }

  return pairs
    .sort((a, b) => a[0] - b[0])
    .map(([i, j]) => ({
      before: ours[i].text,
      after: theirs[j].text,
      afterRaw: theirs[j].raw,
      distance: Number((1 - similarity(ours[i].text, theirs[j].text)).toFixed(2)),
      section: ours[i].section,
    }))
    .filter((e) => e.before !== e.after);
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
  let applied = 0;
  const missed: EditPair[] = [];

  for (const e of edits) {
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
    const f = faqs.findIndex((x) => similarity(norm(x.a), e.before) >= 0.9);
    if (f >= 0) {
      faqs[f].a = e.afterRaw;
      applied++;
      continue;
    }
    const q = faqs.findIndex((x) => similarity(norm(x.q), e.before) >= 0.9);
    if (q >= 0) {
      faqs[q].q = e.afterRaw.replace(/^\*\*|\*\*$/g, "");
      applied++;
      continue;
    }
    missed.push(e);
  }
  return { draft: { ...draft, body: blocks.join(""), faqs }, applied, missed };
}

/** A light fix — a typo, a word — is not worth a house rule. */
export const RULE_WORTHY_DISTANCE = 0.25;
