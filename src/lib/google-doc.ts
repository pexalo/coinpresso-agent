// ---------------------------------------------------------------------------
// Markdown -> Google Docs batchUpdate requests.
//
// The wire track exports plain text, which is fine for a press release that a
// newswire will re-typeset anyway. A blog post is read and commented on in the
// Doc itself, so literal "## " and "[text](url)" in front of the client is not
// good enough. This turns the draft into real heading styles, bold FAQ
// questions, live links and — since the client started asking for tables —
// real Google Docs tables.
//
// The index arithmetic is the part that actually breaks, so it lives here as
// pure functions: text in, requests out, no network, fully testable without a
// Google account.
//
// Tables take two round trips, on purpose:
//
//   Pass 1  insert the whole body as text, with a blank paragraph standing in
//           for each table, apply every heading/bold/link style against that
//           pristine string, then insert the empty tables back-to-front so
//           each insert cannot disturb the index of the next one.
//   Pass 2  read the document back, ask Google where the cells actually are,
//           and fill them back-to-front for the same reason.
//
// Pass 2 exists because the index a cell lands on after insertTable is
// documented nowhere and differs by a character or two between accounts. One
// extra GET buys certainty; guessing buys a table with its text in the wrong
// cells, which is exactly the class of bug this file is meant to prevent.
// ---------------------------------------------------------------------------

export interface DocTable {
  /** Cell text, markdown intact, row-major. Row 0 is the header. */
  cells: string[][];
  /** Offset in `text` of the blank paragraph this table is inserted at. */
  offset: number;
}

export interface DocBuild {
  /** The full text to insert at index 1, newlines and all. */
  text: string;
  /** Styling requests to send after the insert, in order. */
  requests: unknown[];
  /** Tables in document order, to be filled once Google reports their shape. */
  tables: DocTable[];
}

interface Span {
  start: number;
  end: number;
}

/**
 * One pass over the line, emitting plain text and recording spans as it goes.
 *
 * It has to be one pass. Stripping links, then bold, then backticks in
 * sequence means every span recorded by an earlier pass is measured against a
 * string a later pass then shortens, and the styling lands in the wrong place —
 * usually a few characters left of where it belongs, which looks like a bug in
 * Google Docs rather than a bug here.
 */
function inline(line: string, base: number) {
  const bolds: Span[] = [];
  const links: Array<Span & { url: string }> = [];
  let out = "";
  let i = 0;
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    out += line.slice(i, m.index);
    const start = base + out.length;
    if (m[1] !== undefined) {
      out += m[1];
      links.push({ start, end: base + out.length, url: m[2] });
    } else if (m[3] !== undefined) {
      out += m[3];
      bolds.push({ start, end: base + out.length });
    } else {
      out += m[4];
    }
    i = m.index + m[0].length;
  }
  out += line.slice(i);
  return { text: out, bolds, links };
}

/**
 * A markdown table, or null if the block is not one.
 *
 * Short rows are padded rather than dropped. The previous version filtered
 * empty cells out, which silently shifted every later cell one column left the
 * moment a row had a deliberate blank — the failure mode nobody notices until
 * the client is reading it.
 */
export function parseTable(block: string): string[][] | null {
  const rows = block
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("|"));
  const divider = /^\|[\s:|-]+\|$/;
  if (rows.length < 2 || !rows.some((r) => divider.test(r))) return null;

  const data = rows
    .filter((r) => !divider.test(r))
    .map((row) =>
      row
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
    );
  if (data.length < 1 || !data[0].length) return null;

  const width = Math.max(...data.map((r) => r.length));
  return data.map((r) => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });
}

export interface Faq {
  q: string;
  a: string;
}

type Block =
  | { kind: "H1" | "H2" | "P"; raw: string }
  /** One list item. `ordered` picks the bullet preset; items are grouped by adjacency. */
  | { kind: "LI"; raw: string; ordered: boolean }
  | { kind: "TABLE"; cells: string[][] };

/** A line that begins a markdown list item: "- ", "* ", "1. ", "2) ". */
const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+/;

export function buildDoc(
  headline: string,
  body: string,
  faqs: Faq[] = []
): DocBuild {
  const blocks: Block[] = [{ kind: "H1", raw: headline }];

  for (const para of body.split(/\n{2,}/)) {
    const t = para.trim();
    if (!t) continue;

    const h2 = t.match(/^##\s+(.*)$/s);
    if (h2) {
      blocks.push({ kind: "H2", raw: h2[1].trim() });
      continue;
    }

    const table = parseTable(t);
    if (table) {
      blocks.push({ kind: "TABLE", cells: table });
      continue;
    }

    // A markdown list. This used to fall through to the paragraph case, which
    // joins lines with spaces — so a five-item checklist arrived in the Doc as
    // one run-on paragraph with "- " scattered through it. Liam: "seem to
    // have a formatting issue here, should this be a table or bullets?" Each
    // item is its own paragraph and the Docs bullet preset is applied after.
    if (LIST_ITEM.test(t)) {
      for (const line of t.split("\n")) {
        const m = line.match(LIST_ITEM);
        if (m) {
          blocks.push({ kind: "LI", raw: line.slice(m[0].length).trim(), ordered: Boolean(m[2]) });
        } else if (blocks.length && blocks[blocks.length - 1].kind === "LI") {
          // A wrapped continuation of the item above.
          const last = blocks[blocks.length - 1] as { raw: string };
          last.raw += " " + line.trim();
        }
      }
      continue;
    }

    blocks.push({ kind: "P", raw: t.replace(/\n/g, " ") });
  }

  // The pipeline stores FAQs outside the body so it can render them per
  // destination. The Doc is a destination, so they go back on here.
  if (faqs.length) {
    blocks.push({ kind: "H2", raw: "FAQs" });
    for (const f of faqs) {
      blocks.push({ kind: "P", raw: `**${f.q}**` });
      blocks.push({ kind: "P", raw: f.a });
    }
  }

  let text = "";
  const headings: Array<Span & { style: "HEADING_1" | "HEADING_2" }> = [];
  const bolds: Span[] = [];
  const links: Array<Span & { url: string }> = [];
  const tables: DocTable[] = [];
  /** Runs of adjacent list items, as text spans, for the bullet requests. */
  const lists: Array<Span & { ordered: boolean }> = [];

  for (const b of blocks) {
    const start = text.length;

    if (b.kind === "TABLE") {
      // A blank paragraph to insert the table at. It has to be a real
      // paragraph: insertTable needs a location that is not the end of the
      // body segment, and the blank line is also what keeps the table from
      // fusing onto the paragraph above it.
      text += "\n";
      tables.push({ cells: b.cells, offset: start });
      continue;
    }

    const parsed = inline(b.raw, start);
    text += parsed.text + "\n";
    bolds.push(...parsed.bolds);
    links.push(...parsed.links);
    if (b.kind === "LI") {
      const open = lists[lists.length - 1];
      if (open && open.end === start && open.ordered === b.ordered) {
        open.end = text.length;
      } else {
        lists.push({ start, end: text.length, ordered: b.ordered });
      }
      continue;
    }
    if (b.kind !== "P") {
      headings.push({
        start,
        end: text.length,
        style: b.kind === "H1" ? "HEADING_1" : "HEADING_2",
      });
    }
  }

  // Docs indexes the body from 1, so every offset shifts by one.
  const at = (n: number) => n + 1;
  const requests: unknown[] = [];
  for (const h of headings) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: at(h.start), endIndex: at(h.end) },
        paragraphStyle: { namedStyleType: h.style },
        fields: "namedStyleType",
      },
    });
  }

  // Paragraph spacing, and it has to come after the headings.
  //
  // Setting namedStyleType resets the paragraph to that style's own metrics,
  // so spacing applied first is silently thrown away by the heading requests
  // above. This is why the export kept arriving as a wall of text: every
  // paragraph was a real paragraph, Docs just drew them with nothing between,
  // which reads as missing line breaks to anyone looking at it.
  //
  // Spacing rather than blank lines, deliberately. A blank paragraph between
  // every block looks the same on screen and then behaves differently the
  // moment anyone edits, and it makes the table placeholders ambiguous.
  if (text.length > 1) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: text.length },
        paragraphStyle: {
          lineSpacing: 115,
          spaceAbove: { magnitude: 0, unit: "PT" },
          spaceBelow: { magnitude: 10, unit: "PT" },
        },
        fields: "lineSpacing,spaceAbove,spaceBelow",
      },
    });
  }

  // Headings get room above them, so a section reads as a break rather than
  // as the next paragraph in bigger type. The first block is the H1 and needs
  // nothing above it.
  for (const h of headings) {
    if (h.start === 0) continue;
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: at(h.start), endIndex: at(h.end) },
        paragraphStyle: {
          spaceAbove: { magnitude: 18, unit: "PT" },
          spaceBelow: { magnitude: 6, unit: "PT" },
        },
        fields: "spaceAbove,spaceBelow",
      },
    });
  }
  for (const b of bolds) {
    if (b.end <= b.start) continue;
    requests.push({
      updateTextStyle: {
        range: { startIndex: at(b.start), endIndex: at(b.end) },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }
  for (const l of links) {
    if (l.end <= l.start) continue;
    requests.push({
      updateTextStyle: {
        range: { startIndex: at(l.start), endIndex: at(l.end) },
        textStyle: { link: { url: l.url } },
        fields: "link",
      },
    });
  }

  // Bullets. A paragraph property, so no index shifts — but it must come
  // after the spacing pass above, which would otherwise set list items to the
  // body's paragraph spacing and leave the list looking like prose with dots.
  for (const l of lists) {
    requests.push({
      createParagraphBullets: {
        range: { startIndex: at(l.start), endIndex: at(l.end) },
        bulletPreset: l.ordered
          ? "NUMBERED_DECIMAL_ALPHA_ROMAN"
          : "BULLET_DISC_CIRCLE_SQUARE",
      },
    });
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: at(l.start), endIndex: at(l.end) },
        paragraphStyle: { spaceBelow: { magnitude: 4, unit: "PT" } },
        fields: "spaceBelow",
      },
    });
  }

  // Tables last, and back-to-front. Every styling range above was measured
  // against the plain string; inserting a table shifts everything after it, so
  // no table may be inserted until the styling is done, and the later ones
  // must go in before the earlier ones or their offsets go stale mid-batch.
  for (let i = tables.length - 1; i >= 0; i--) {
    const t = tables[i];
    requests.push({
      insertTable: {
        rows: t.cells.length,
        columns: t.cells[0].length,
        location: { index: at(t.offset) },
      },
    });
  }

  return { text, requests, tables };
}

// ---------------------------------------------------------------------------
// Pass 2: fill the cells.
// ---------------------------------------------------------------------------

export interface DocTableShape {
  /** Row-major index of the first paragraph inside each cell. */
  cellStarts: number[][];
}

/** Where Google says the cells are, from a documents.get response. */
export function readTableShapes(doc: unknown): DocTableShape[] {
  const content =
    (doc as { body?: { content?: unknown[] } })?.body?.content ?? [];
  const shapes: DocTableShape[] = [];

  for (const el of content as Array<Record<string, any>>) {
    const table = el?.table;
    if (!table) continue;
    const rows: number[][] = [];
    for (const row of table.tableRows ?? []) {
      const cells: number[] = [];
      for (const cell of row?.tableCells ?? []) {
        const first = cell?.content?.[0]?.startIndex;
        if (typeof first === "number") cells.push(first);
        else if (typeof cell?.startIndex === "number")
          cells.push(cell.startIndex + 1);
      }
      rows.push(cells);
    }
    shapes.push({ cellStarts: rows });
  }
  return shapes;
}

/**
 * Requests that put the cell text in, strictly back-to-front.
 *
 * Every index here came from Google, so it is correct for the document as it
 * stands. Writing into a cell shifts everything after it, so the walk runs
 * last table, last row, last cell first: an index we have not used yet is
 * always in front of every edit already made.
 */
export function fillTableRequests(
  tables: DocTable[],
  shapes: DocTableShape[]
): unknown[] {
  const requests: unknown[] = [];
  const count = Math.min(tables.length, shapes.length);

  for (let t = count - 1; t >= 0; t--) {
    const cells = tables[t].cells;
    const starts = shapes[t].cellStarts;
    for (let r = Math.min(cells.length, starts.length) - 1; r >= 0; r--) {
      const row = cells[r];
      const rowStarts = starts[r];
      for (let c = Math.min(row.length, rowStarts.length) - 1; c >= 0; c--) {
        const index = rowStarts[c];
        const parsed = inline(row[c] ?? "", index);
        if (!parsed.text) continue;

        requests.push({ insertText: { location: { index }, text: parsed.text } });

        if (r === 0) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: index, endIndex: index + parsed.text.length },
              textStyle: { bold: true },
              fields: "bold",
            },
          });
        }
        for (const b of parsed.bolds) {
          if (b.end <= b.start) continue;
          requests.push({
            updateTextStyle: {
              range: { startIndex: b.start, endIndex: b.end },
              textStyle: { bold: true },
              fields: "bold",
            },
          });
        }
        for (const l of parsed.links) {
          if (l.end <= l.start) continue;
          requests.push({
            updateTextStyle: {
              range: { startIndex: l.start, endIndex: l.end },
              textStyle: { link: { url: l.url } },
              fields: "link",
            },
          });
        }
      }
    }
  }
  return requests;
}
