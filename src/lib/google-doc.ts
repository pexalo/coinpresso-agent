// ---------------------------------------------------------------------------
// Markdown -> Google Docs batchUpdate requests.
//
// The wire track exports plain text, which is fine for a press release that a
// newswire will re-typeset anyway. A blog post is read and commented on in the
// Doc itself, so literal "## " and "[text](url)" in front of the client is not
// good enough. This turns the draft into real heading styles, bold FAQ
// questions and live links.
//
// It is deliberately a pure function: text in, requests out, no network. That
// makes the index arithmetic — the part that actually breaks — testable without
// a Google account.
// ---------------------------------------------------------------------------

export interface DocBuild {
  /** The full text to insert at index 1, newlines and all. */
  text: string;
  /** Styling requests to send after the insert, in order. */
  requests: unknown[];
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

export interface Faq {
  q: string;
  a: string;
}

export function buildDoc(
  headline: string,
  body: string,
  faqs: Faq[] = []
): DocBuild {
  const blocks: Array<{ kind: "H1" | "H2" | "P"; raw: string }> = [
    { kind: "H1", raw: headline },
  ];
  for (const para of body.split(/\n{2,}/)) {
    const t = para.trim();
    if (!t) continue;
    const h2 = t.match(/^##\s+(.*)$/s);
    if (h2) blocks.push({ kind: "H2", raw: h2[1].trim() });
    else blocks.push({ kind: "P", raw: t.replace(/\n/g, " ") });
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

  for (const b of blocks) {
    const start = text.length;
    const parsed = inline(b.raw, start);
    text += parsed.text + "\n";
    bolds.push(...parsed.bolds);
    links.push(...parsed.links);
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

  return { text, requests };
}
