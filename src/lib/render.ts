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
    delink(d.body).replace(/^#{1,6}\s+/gm, ""),
    "",
    faqBlock(run),
  ];
  if (d.tags.length) parts.push("", `Tags: ${d.tags.join(", ")}`);
  return parts.join("\n");
}

export function renderMarkdown(run: Run): string {
  const d = run.draft;
  if (!d) return "";
  const parts = [`# ${d.headline}`, "", d.body, ""];
  if (d.faqs.length) {
    parts.push("## FAQs", "");
    d.faqs.forEach((f) => parts.push(`**${f.q}**`, "", f.a, ""));
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

  const blocks = d.body.split(/\n{2,}/).map((raw) => {
    const block = raw.trim();
    if (!block) return "";
    const h = block.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 4);
      return `<h${level}>${inline(h[2])}</h${level}>`;
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
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/(^|[^"'>])\b(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>')
      .replace(/\n/g, "<br />");
  }
}
