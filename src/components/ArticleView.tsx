"use client";

import { useState } from "react";
import type { Draft } from "@/lib/types";

type Tab = "read" | "html" | "plain" | "markdown";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "read", label: "Read", hint: "Rendered preview" },
  { id: "html", label: "HTML", hint: "Paste into a wire's rich-text field" },
  { id: "plain", label: "Plain text", hint: "Paste into a plain submission form" },
  { id: "markdown", label: "Markdown", hint: "For editing elsewhere" },
];

export default function ArticleView({
  draft,
  rendered,
}: {
  draft: Draft;
  rendered: { plain: string; markdown: string; html: string };
}) {
  const [tab, setTab] = useState<Tab>("read");
  const [copied, setCopied] = useState(false);

  const raw =
    tab === "html" ? rendered.html : tab === "plain" ? rendered.plain : rendered.markdown;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        tab === "read" ? rendered.markdown : raw
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-bold text-sm">Draft</h2>
          <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
            {draft.wordCount} words · {draft.faqs.length} FAQ
            {draft.faqs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--line)] overflow-hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                title={t.hint}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={copy}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="p-5 md:p-7">
        {tab === "read" ? (
          <article className="prose-article max-w-none">
            <h1 className="text-xl md:text-2xl font-extrabold leading-snug mb-4">
              {draft.headline}
            </h1>
            <div
              dangerouslySetInnerHTML={{
                __html: rendered.html.replace(/^<h1>[\s\S]*?<\/h1>/, ""),
              }}
            />
          </article>
        ) : (
          <pre className="text-[11.5px] leading-relaxed text-[var(--ink-2)] whitespace-pre-wrap break-words">
            {raw}
          </pre>
        )}
      </div>

      {draft.tags.length > 0 && (
        <div className="px-5 md:px-7 pb-6 flex flex-wrap gap-1.5">
          {draft.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)] text-[var(--ink-3)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
