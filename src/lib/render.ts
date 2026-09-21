// ---------------------------------------------------------------------------
// Output rendering. One draft, three shapes:
//   - plain text  : what goes into a Google Doc, and what Liam pastes into a
//                   submission form where naked URLs are expected
//   - html        : for wires that accept pasted rich text with live anchors
//   - markdown    : the working format, for editing elsewhere
// ---------------------------------------------------------------------------

import type { Run } from "./types";
import { PUBLICATIONS } from "./publications";

function faqBlock(run: Run): string {
  if (!run.draft?.faqs.length) return "";
  return (
    "FAQs\n\n" +
    run.draft.faqs.map((f) => `${f.q}\n${f.a}`).join("\n\n")
  );
}

/** Strip markdown link syntax down to "text (url)" for plain-text targets. */
function delink(md: string): string {
  return md.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");
}

export function renderPlainText(run: Run): string {
  const d = run.draft;
  if (!d) return "";
  const parts = [
    d.headline,
    "",
    delink(bodyOf(d)).replace(/^#{1,6}\s+/gm, ""),
    "",
    faqBlock(run),
  ];
  if (d.tags.length) parts.push("", `Tags: ${d.tags.join(", ")}`);
  return parts.join("\n");
}

/**
 * Liam, 21 Sep: "All headings should be title case (capital letter at start of
 * each word apart from unimportant words such as 'a' and 'the')". FAQ
 * questions are exempt — they live outside the body and are not touched.
 * The first and last word are always capitalised; after a hyphen the word is
 * left as written ("Crypto-specific"), which is how he wrote them.
 */
const MINOR_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.",
]);
export function titleCase(heading: string): string {
  const words = heading.split(/(\s+)/);
  const real = words.map((w, i) => (i % 2 ? null : w)).filter((w) => w !== null && w !== "") as string[];
  let n = -1;
  return words
    .map((w, i) => {
      if (i % 2 || !w) return w;
      n++;
      const lead = w.match(/^[^A-Za-z0-9]*/)?.[0] ?? "";
      const core = w.slice(lead.length);
      if (!core) return w;
      const bare = core.toLowerCase().replace(/[^a-z.]/g, "");
      const edge = n === 0 || n === real.length - 1;
      if (!edge && MINOR_WORDS.has(bare)) return lead + core.toLowerCase();
      // Leave acronyms and mixed case (FAQs, llms.txt, DeFi) alone.
      if (/[A-Z]/.test(core.slice(1)) || /\./.test(core)) return w;
      return lead + core[0].toUpperCase() + core.slice(1);
    })
    .join("");
}

export function titleCaseHeadings(body: string): string {
  return body.replace(/^(#{2,3})[ \t]+(.+)$/gm, (_m, hashes: string, text: string) => `${hashes} ${titleCase(text.trim())}`);
}

/** See normaliseConclusionHeading in the writer — this catches drafts written before it. */
export function bodyOf(d: { body: string; faqs: unknown[] }): string {
  const body = d.faqs.length
    ? d.body.replace(/^(##\s+)Conclusion\s+(?:and|&|\+)\s+FAQs?[ \t]*$/im, "$1Conclusion")
    : d.body;
  return titleCaseHeadings(body);
}

export function renderMarkdown(run: Run): string {
  const d = run.draft;
  if (!d) return "";
  const parts = [`# ${d.headline}`, "", bodyOf(d), ""];
  if (d.faqs.length) {
    parts.push("## FAQs", "");
    d.faqs.forEach((f) => parts.push(`### ${f.q}`, "", f.a, ""));
  }
  if (d.tags.length) parts.push(`**Tags:** ${d.tags.join(", ")}`);
  return parts.join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface HtmlOptions {
  /** WordPress renders the title from its own field, so the body must not
   *  carry an H1 of its own or the post shows the headline twice. */
  includeH1?: boolean;
  includeTagLine?: boolean;
  includePublicationComment?: boolean;
}

/** Small, dependency-free markdown-to-HTML pass. Handles what the writer emits. */
export function renderHtml(run: Run, opts: HtmlOptions = {}): string {
  const {
    includeH1 = true,
    includeTagLine = true,
    includePublicationComment = true,
  } = opts;
  const d = run.draft;
  if (!d) return "";
  const pub = PUBLICATIONS[run.brief.publication];

  const blocks = bodyOf(d).split(/\n{2,}/).map((raw) => {
    const block = raw.trim();
    if (!block) return "";
    const h = block.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 4);
      return `<h${level}>${inline(h[2])}</h${level}>`;
    }
    // A markdown table. The client asked for real tables in the posts, so they
    // have to survive the trip into WordPress — before this they arrived as a
    // paragraph of pipe characters, which is worse than not having the table.
    if (/^\s*\|.*\|\s*$/m.test(block) && block.split("\n").length >= 2) {
      const rows = block
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r.startsWith("|"));
      // The --- row is the separator, not data.
      const isRule = (r: string) => /^\|[\s:|-]+\|$/.test(r);
      const cells = (r: string) =>
        r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !isRule(r));
      if (body.length) {
        const head = cells(body[0])
          .map((c) => `<th>${inline(c)}</th>`)
          .join("");
        const rest = body
          .slice(1)
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("");
        return `<figure class="wp-block-table"><table><thead><tr>${head}</tr></thead><tbody>${rest}</tbody></table></figure>`;
      }
    }

    // Bullet and numbered lists, for the same reason.
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^[-*+]\s+\S/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*+]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.length && lines.every((l) => /^\d+\.\s+\S/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
    }

    // A bare URL on its own line is a naked-style citation — keep it linked but
    // visually as the wire expects.
    if (/^https?:\/\/\S+$/.test(block)) {
      return `<p><a href="${block}">${block}</a></p>`;
    }
    return `<p>${inline(block)}</p>`;
  });

  const faqs = d.faqs.length
    ? `<h2>FAQs</h2>` +
      d.faqs
        .map((f) => `<h3>${esc(f.q)}</h3><p>${inline(f.a)}</p>`)
        .join("")
    : "";

  return [
    includeH1 ? `<h1>${esc(d.headline)}</h1>` : "",
    ...blocks,
    faqs,
    includeTagLine && d.tags.length
      ? `<p><strong>Tags:</strong> ${esc(d.tags.join(", "))}</p>`
      : "",
    includePublicationComment
      ? `<!-- ${pub.name} — ${pub.linkStyle} link style -->`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  function inline(s: string): string {
    return esc(s)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2">$1</a>'
      )
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/(^|[^"'>])\b(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>')
      .replace(/\n/g, "<br />");
  }
}
