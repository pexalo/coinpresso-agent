#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Fold Coinpresso's content-recommendation docs into the topics they belong to.
//
//   node scripts/briefs-to-seeds.mjs data/content-calendar.json data/briefs/
//
// Each brief is one Drive doc saved as plain text, named <docId>.txt. The docs
// come in two shapes and the parser has to handle both, because they are mixed
// in the same calendar:
//
//   LABEL SHAPE   "Primary Keyword: x" lines, then SERP Gap Analysis /
//                 Unique Angle / Recommended Article Structure / FAQ Section.
//   TABLE SHAPE   a numbered "1. SEO Brief" table of Element/Recommendation
//                 rows, then SERP Landscape and Gap / Unique Coinpresso Angle /
//                 Why This Article Can Win / Recommended Article Outline /
//                 Original Asset or Methodology / FAQ Section / Conversion and
//                 Linking Plan / References.
//
// So sections are found by NAME, from a list of the names both shapes use, and
// a doc that yields none of them is reported and left alone rather than
// half-parsed. A brief that silently loses its angle is worse than one that is
// obviously missing.
//
// TWO THINGS ARE DELIBERATELY QUARANTINED.
//
//   FIGURES. The docs quote market sizes and percentages their author found
//   somewhere. By the time they reach the strategy agent they look like figures
//   the client supplied and verified, which is exactly how an unsourced number
//   reaches a published post. Every enriched note opens with a line saying they
//   are the brief author's unverified claims, to be sourced or written around.
//
//   REFERENCES. The table-shape docs end with a References list. Those are the
//   doc author's citations, not pages this pipeline retrieved, and the writer
//   may only cite the research ledger. The section is dropped rather than
//   passed through, so it cannot be mistaken for a ready-made source list.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";

const [, , calendarPath, briefDir] = process.argv;
if (!calendarPath || !briefDir) {
  console.error("usage: node scripts/briefs-to-seeds.mjs <calendar.json> <brief-dir>");
  process.exit(1);
}

/**
 * Every heading either shape uses, in the order they appear, mapped to the one
 * label used downstream. `drop` marks a section that is read only so that it
 * ends the previous one — its body is never passed on.
 */
const HEADINGS = [
  { re: /^SEO Brief$/i, key: "seo" },
  // Three doc templates are in circulation and they name this section three
  // ways. Found by counting headings across all 74 rather than by reading a
  // sample: the exact-match version silently returned nothing for 48 of them,
  // and "no gap section" looks identical to "the doc did not have one".
  { re: /^SERP\s*(Gap(\s*Analysis)?|Landscape and Gap)$/i, key: "gap" },
  { re: /^Unique (Coinpresso )?Angle$/i, key: "angle" },
  { re: /^Why This Article Can Win$/i, key: "why" },
  { re: /^Recommended Article (Structure|Outline)$/i, key: "outline" },
  { re: /^Original Asset( or Methodology)?$/i, key: "asset" },
  { re: /^FAQ( Section)?$/i, key: "faq" },
  { re: /^Conversion and Linking Plan$/i, key: "linking" },
  { re: /^References$/i, key: "drop" },
];

/** A heading line, with the "3. " a numbered doc puts in front of it. */
function headingOf(line) {
  const bare = line
    .trim()
    .replace(/^#{1,6}\s*/, "") // a markdown export writes headings as ## Heading
    .replace(/^\d+[.)]\s*/, "") // a Doc export numbers them: "5. Recommended…"
    .replace(/\*\*/g, "")
    .replace(/:$/, "");
  return HEADINGS.find((h) => h.re.test(bare))?.key;
}

function sections(text) {
  const found = {};
  let current = null;
  let buf = [];
  const flush = () => {
    if (current && current !== "drop") {
      found[current] = (found[current] ? found[current] + "\n" : "") + buf.join("\n").trim();
    }
    buf = [];
  };
  for (const line of text.split("\n")) {
    const key = headingOf(line);
    if (key) {
      flush();
      current = key;
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return found;
}

function clean(s) {
  return (s ?? "")
    .replace(/\\([*_|])/g, "$1")
    // Footnote markers: a Doc renders them as digits glued to the sentence that
    // carries them — "…are not identical.2 3 4". They are references to a list
    // this pipeline deliberately drops, so they are noise on screen and, worse,
    // stray digits in a prompt. The lookbehind keeps decimals ("1.5") intact:
    // a real footnote follows a letter or a bracket, never another digit.
    .replace(/(?<=[A-Za-z)\]])\.\d+(?:\s+\d+)*(?=\s|$)/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * `Primary keyword: x`, whether the value is on the same line or the next one.
 *
 * A Google Doc table exported as text puts every CELL on its own line, so in the
 * table-shaped briefs the label and its value are two separate lines and a
 * same-line regex finds nothing at all. That is not a visible failure — it just
 * returns no keywords, and 64 of 80 topics quietly went into the queue with an
 * empty keyword list.
 */
function keywordLine(text, label) {
  const lines = text.split("\n");
  // Not anchored to the start of the line: several briefs run the header
  // together as "Prepared for: Coinpresso.io Primary Keyword: … Secondary
  // Keywords: …" on one line. The value stops at the next label rather than the
  // end of the line, or the primary keyword would swallow the secondary list.
  const re = new RegExp(
    `\\*{0,2}${label}\\*{0,2}\\s*[:\\t]?\\s*(.*?)\\s*(?=\\bPrimary Keyword\\b|\\bSecondary Keywords\\b|\\bSearch intent\\b|$)`,
    "i"
  );
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const sameLine = m[1].replace(/\*/g, "").trim();
    if (sameLine) return sameLine;
    // Label alone on its line: the value is the next line with anything on it.
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const next = lines[j].replace(/\*/g, "").trim();
      if (next) return next;
    }
  }
  return "";
}

/**
 * The outline as a numbered list.
 *
 * Both shapes are Google Doc tables, and a table exported as text is one cell
 * per line — so a row is a run of lines, not a line with separators. Rows are
 * found by their first cell:
 *
 *   TABLE SHAPE  "1. What Share of Model Voice Measures", then the focus, then
 *                a bare target-word count.
 *   LABEL SHAPE  a bare "1", then the title, then the focus.
 *
 * Which pattern marks a row start therefore has to be decided per document.
 * Treating a bare number as a row start in a table-shaped doc would split every
 * row in half at its word count — "220" would begin a new section.
 */
function outline(raw) {
  const lines = raw
    .split("\n")
    // A markdown export writes the table as pipe rows instead of one cell per
    // line. Flattened to the same one-cell-per-line shape first, so a single
    // row parser serves both, and the alignment row is dropped on the way.
    .flatMap((l) =>
      l.includes("|")
        ? l.replace(/^\||\|$/g, "").split("|").filter((c) => !/^\s*:?-+:?\s*$/.test(c))
        : [l]
    )
    .map((l) => clean(l))
    .filter(Boolean);
  // WHICH CELL STARTS A ROW.
  //
  // Not "does the doc contain a numbered line" — one template has both at once:
  // the row-number cell is a bare "2" and the title cell in the same row begins
  // "1. Coinpresso: …" because the article is a listicle. Reading that as the
  // numbered shape made every row start at a title, swallowed the next row's
  // number as a word count, and produced five sections of "~3 words" from a
  // nine-section outline — wrong on screen and wrong in the prompt.
  //
  // So bare numbers win when they form an ascending run from 1, which is what a
  // table's row-number column looks like and what a sentence never does.
  const bare = lines.filter((l) => /^\d+$/.test(l)).map((l) => parseInt(l, 10));
  const isRowColumn =
    bare.length >= 2 && bare[0] === 1 && bare.every((n, i) => i === 0 || n > bare[i - 1]);
  const numbered = !isRowColumn && lines.some((l) => /^\d+\.\s+\S/.test(l));
  const startsRow = (l) => (numbered ? /^\d+\.\s+\S/.test(l) : /^\d+$/.test(l));

  const rows = [];
  let cur = null;
  for (const line of lines) {
    if (startsRow(line)) {
      if (cur) rows.push(cur);
      cur = numbered
        ? { n: parseInt(line, 10), cells: [line.replace(/^\d+\.\s*/, "")] }
        : { n: parseInt(line, 10), cells: [] };
    } else if (cur) {
      cur.cells.push(line);
    }
    // Lines before the first row are the table header; deliberately dropped.
  }
  if (cur) rows.push(cur);

  return rows
    .filter((r) => r.cells.length)
    .map((r) => {
      const cells = [...r.cells];
      // A trailing bare number is the target word count, not part of the focus.
      const words = /^\d+$/.test(cells[cells.length - 1])
        ? parseInt(cells.pop(), 10)
        : undefined;
      const [title, ...focus] = cells;
      return {
        n: r.n,
        title,
        focus: focus.join(" — ") || undefined,
        words,
      };
    });
}

/**
 * The FAQ block, split back into question and answer.
 *
 * Both shapes put a whole Q&A on one line — "Q1: … ? answer…" in the label
 * briefs, and an unnumbered "Question? answer…" in the table ones. The split is
 * at the FIRST question mark, because that is where the question ends;
 * splitting at the last would swallow an answer that asks a rhetorical
 * question, and there are several.
 */
function faqs(raw) {
  // Cleaned BEFORE splitting, not after. The footnote markers a Doc glues to a
  // sentence — "…hide platform-specific weaknesses.2 3 4" — leave the full stop
  // followed by a digit rather than a space, so the question-boundary walk finds
  // no sentence end and swallows the next question into the previous answer.
  // One FAQ silently becomes four.
  const text = clean(raw).replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  const marks = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "?") marks.push(i);
  if (!marks.length) return [];

  // Where the question ending at `mark` begins: just after the previous
  // sentence terminator. Every question in these docs follows one, which is
  // what makes the run-on template splittable at all — and it is why the split
  // is not simply "at the first ?", which would work for the numbered template
  // and quietly return one giant FAQ for the other two.
  const questionStart = (mark, floor) => {
    for (let i = mark - 1; i > floor; i--) {
      if (".!?".includes(text[i]) && /\s/.test(text[i + 1] ?? " ")) return i + 1;
    }
    return floor;
  };

  const out = [];
  let cursor = 0;
  for (let m = 0; m < marks.length; m++) {
    const qs = questionStart(marks[m], cursor);
    // A '?' inside an answer, with no room for a question in front of it.
    if (qs <= cursor && out.length && marks[m] - cursor < 3) continue;
    const q = text
      .slice(qs, marks[m] + 1)
      .replace(/^\**Q\d+[:.]\s*/i, "")
      .replace(/\*/g, "")
      .trim();
    const nextQs =
      m + 1 < marks.length ? questionStart(marks[m + 1], marks[m] + 1) : text.length;
    if (q) out.push({ q, a: clean(text.slice(marks[m] + 1, nextQs)) });
    cursor = nextQs;
    while (m + 1 < marks.length && marks[m + 1] < cursor) m++;
  }
  return out;
}

/**
 * The SEO brief table: label and value on alternating lines, blank-line
 * separated. Paired back up so the writer reads "Meta title: …" rather than two
 * orphaned lines.
 */
function seoBrief(raw) {
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => clean(l)).filter(Boolean))
    .filter((cells) => cells.length >= 2)
    // The table's own header row, which is a label/value pair of nothing.
    .filter(([label]) => !/^element$/i.test(label))
    .map(([label, ...rest]) => ({ label, value: rest.join(" ") }));
}

const calendar = JSON.parse(await fs.readFile(calendarPath, "utf8"));
const files = (await fs.readdir(briefDir)).filter((f) => /\.(txt|md)$/.test(f));
const byDoc = new Map(files.map((f) => [f.replace(/\.(txt|md)$/, ""), path.join(briefDir, f)]));

let enriched = 0;
const unusable = [];
const noBrief = [];

for (const topic of calendar) {
  const docId = /\/document\/d\/([^/]+)/.exec(topic.referenceUrl ?? "")?.[1];
  const file = docId && byDoc.get(docId);
  if (!file) {
    if (topic.referenceUrl) noBrief.push(topic.topic);
    continue;
  }

  const text = await fs.readFile(file, "utf8");
  const s = sections(text);

  const primary = keywordLine(text, "Primary Keyword");
  const secondary = keywordLine(text, "Secondary Keywords")
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const rows = s.outline ? outline(s.outline) : [];

  if (!primary && !s.angle && !rows.length) {
    unusable.push(`${docId} (${topic.topic.slice(0, 50)})`);
    continue;
  }

  // The doc's keywords are the target and go first. Anything the calendar row
  // already carried is kept behind them rather than replaced — an outreach
  // row's keyword came from a different decision and is not the doc's to
  // overrule.
  topic.keywords = [
    ...new Set([primary, ...secondary, ...(topic.keywords ?? [])].map((k) => k?.trim()).filter(Boolean)),
  ];

  // Structure, not a paragraph. The brief's whole job is to tell the writer
  // what shape the piece takes and what it may not say, and both of those are
  // lost the moment an outline becomes prose. `notes` stays what a person typed.
  topic.brief = {
    spec: s.seo ? seoBrief(s.seo) : undefined,
    angle: s.angle ? clean(s.angle) : undefined,
    gap: s.gap ? clean(s.gap) : undefined,
    rationale: s.why ? clean(s.why) : undefined,
    outline: rows.length ? rows : undefined,
    asset: s.asset ? clean(s.asset) : undefined,
    faqs: s.faq ? faqs(s.faq) : undefined,
    linking: s.linking ? clean(s.linking) : undefined,
    docId,
    importedAt: new Date().toISOString(),
  };
  for (const k of Object.keys(topic.brief)) {
    if (topic.brief[k] === undefined) delete topic.brief[k];
  }
  enriched++;
}

await fs.writeFile(calendarPath, JSON.stringify(calendar, null, 1), "utf8");

console.log(`Brief files    : ${files.length}`);
console.log(`Topics enriched: ${enriched} of ${calendar.length}`);
if (unusable.length) {
  console.log(`\nDid not match either brief shape — left alone, not half-parsed:`);
  unusable.forEach((u) => console.log(`  ${u}`));
}
if (noBrief.length) {
  console.log(`\nHave a brief link but no file on disk (${noBrief.length}):`);
  noBrief.forEach((t) => console.log(`  ${t.slice(0, 70)}`));
}
