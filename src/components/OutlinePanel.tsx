"use client";

import type { ContentBrief } from "@/lib/content-brief";
import type { Draft } from "@/lib/types";

/**
 * The outline the post was meant to follow, and whether it did.
 *
 * Exists because the first seven live posts followed their outlines section
 * for section and were still wrong — every heading had been rephrased — and
 * the only way to see that was to open the brief in one window and the article
 * in another. Now each section shows a tick when the article's H2 matches it
 * exactly, and says who wrote the outline: the client, or the research stage
 * imitating the client's format.
 */
export default function OutlinePanel({
  brief,
  draft,
}: {
  brief?: ContentBrief;
  draft?: Draft;
}) {
  const outline = brief?.outline ?? [];
  if (!outline.length) return null;

  // Fenced code is stripped first: a post demonstrating markdown contains
  // "## " lines that are examples, not sections, and counting them here made
  // the tick list disagree with what the writer actually enforced.
  const prose = draft?.body.replace(/```[\s\S]*?```/g, "") ?? "";
  const h2s = draft
    ? [...prose.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1])
    : [];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const matched = outline.map((s) => h2s.some((h) => norm(h) === norm(s.title)));
  const allMatch = draft ? matched.every(Boolean) && h2s.length === outline.length : null;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--line)]">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-bold text-[13px]">Outline</h3>
          {allMatch !== null && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                allMatch
                  ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10"
                  : "text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10"
              }`}
            >
              {allMatch ? "Followed exactly" : `${matched.filter(Boolean).length} of ${outline.length} match`}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
          {brief?.generated
            ? "Written by research in Coinpresso's format — this topic had no brief."
            : "From Coinpresso's brief. The article's headings must be these, verbatim."}
        </p>
      </div>
      <ol className="divide-y divide-[var(--line)]">
        {outline.map((s, i) => (
          <li key={s.n} className="px-4 py-2 flex items-start gap-2.5 text-[12px]">
            <span
              className={`mt-0.5 flex-none w-4 text-center font-mono text-[10.5px] ${
                draft
                  ? matched[i]
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
                  : "text-[var(--ink-4)]"
              }`}
            >
              {draft ? (matched[i] ? "✓" : "✗") : s.n}
            </span>
            <div className="min-w-0">
              <div className="text-[var(--ink)] leading-snug">{s.title}</div>
              {s.focus && (
                <div className="text-[11px] text-[var(--ink-3)] mt-0.5 leading-snug">{s.focus}</div>
              )}
            </div>
            {s.words ? (
              <span className="ml-auto flex-none text-[10.5px] text-[var(--ink-4)] font-mono">~{s.words}w</span>
            ) : null}
          </li>
        ))}
      </ol>
      {brief?.faqs?.length ? (
        <div className="px-4 py-2.5 border-t border-[var(--line)] text-[11px] text-[var(--ink-3)]">
          {brief.faqs.length} FAQ{brief.faqs.length === 1 ? "" : "s"} specified
          {draft ? ` · ${draft.faqs.length} in the article` : ""}
        </div>
      ) : null}
    </div>
  );
}
