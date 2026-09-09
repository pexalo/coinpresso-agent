"use client";

// ---------------------------------------------------------------------------
// Publishing by hand.
//
// "Send to WordPress" exists, but it is not always the right route: the
// connection can be down, the client may prefer to set categories and SEO
// fields themselves, or the post may need a human edit on the way in. When
// that happens the operator should not have to remember the order of
// operations or hunt for the pieces.
//
// So this is the checklist with the pieces attached — each step copies the
// exact thing that step needs. The order is not decorative: the featured
// image has to be set before publish or the social card is wrong, and the
// Code editor has to be chosen before pasting or WordPress escapes the HTML
// into visible tags.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface Step {
  title: string;
  detail: string;
  /** Label for the copy button, if this step has something to copy. */
  copy?: string;
  value?: () => string | Promise<string>;
  /** A direct download rather than a clipboard copy. */
  download?: { label: string; href: string; filename: string };
}

function CopyButton({ label, value }: { label: string; value: () => string | Promise<string> }) {
  const [done, setDone] = useState(false);
  const click = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(await value());
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      setDone(false);
    }
  }, [value]);
  return (
    <button
      onClick={click}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-[var(--line)] hover:border-[var(--accent)]/50 transition-colors shrink-0"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export default function PublishManually({
  clientRef,
  runId,
  headline,
  html,
  markdown,
  slug,
}: {
  clientRef: string;
  runId: string;
  headline: string;
  html: string;
  markdown: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [imageHref, setImageHref] = useState<string | undefined>();

  // Only offer the image step once there is a finished one to download. An
  // empty download button is worse than no step at all.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${clientRef}/runs/${runId}/image`);
        const data = (await res.json()) as {
          versions?: Array<{ id: string; composed?: boolean }>;
        };
        const done = data.versions?.find((v) => v.composed);
        if (!cancelled && done) {
          setImageHref(
            `/api/clients/${clientRef}/runs/${runId}/image?v=${done.id}&kind=composed`
          );
        }
      } catch {
        // No image is a normal state, not an error worth surfacing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientRef, runId]);

  const steps: Step[] = [
    {
      title: "Start a new post in WordPress",
      detail:
        "Posts → Add New. Leave it as a draft until the very last step — a published post with no featured image is what gets shared while you are still working on it.",
    },
    {
      title: "Paste the title",
      detail:
        "Into the title field at the top, not into the body. WordPress uses it for the H1 and the slug.",
      copy: "Copy title",
      value: () => headline,
    },
    {
      title: "Switch the editor to Code editor",
      detail:
        "The ⋮ menu at the top right → Code editor, or ⌥⌘M on a Mac. This is the step people skip, and skipping it means WordPress shows the HTML tags as visible text instead of applying them.",
    },
    {
      title: "Paste the article HTML into the body",
      detail:
        "Everything is already formatted: headings, links, the tables and the FAQ section. Paste, then switch back to the Visual editor and check the table rendered as a table.",
      copy: "Copy article HTML",
      value: () => html,
    },
    ...(imageHref
      ? [
          {
            title: "Set the featured image",
            detail:
              "Download it here, then Post → Featured image → Set featured image → Upload. Do this before publishing: it is the picture that appears when the post is shared, and a post published without one keeps the blank card in social caches for a while.",
            download: {
              label: "Download image",
              href: imageHref,
              filename: `${slug}.png`,
            },
          } as Step,
        ]
      : []),
    {
      title: "Set the URL slug",
      detail:
        "Post → URL. WordPress will have generated one from the title; shorten it to the keyword phrase and drop the filler words.",
      copy: "Copy suggested slug",
      value: () => slug,
    },
    {
      title: "Category, and the SEO fields",
      detail:
        "Pick the category you would have picked anyway. If Yoast or RankMath is installed, fill the meta description rather than letting it auto-generate — the first two sentences of the post are written to be liftable, so they make a good starting point.",
    },
    {
      title: "Read it once in Preview, then publish",
      detail:
        "Check three things: the tables have borders, every link opens the page it claims, and the FAQ headings are H3 rather than bold paragraphs. Then publish, and paste the live URL back into the run so the archive knows where it went.",
    },
  ];

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--surface-2)]/50 transition-colors"
      >
        <span>
          <span className="block text-[13px] font-semibold">
            Publish by hand
          </span>
          <span className="block text-[11px] text-[var(--ink-3)] mt-0.5">
            Eight steps, with each piece ready to copy. For when you would
            rather place it in WordPress yourself.
          </span>
        </span>
        <span className="text-[11px] text-[var(--ink-3)] shrink-0">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <ol className="border-t border-[var(--line)] divide-y divide-[var(--line)]">
          {steps.map((step, i) => (
            <li key={step.title} className="px-5 py-3.5 flex gap-3.5">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--surface-2)] text-[11px] font-semibold grid place-items-center tabular-nums mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12.5px] font-semibold leading-snug">
                    {step.title}
                  </p>
                  {step.copy && step.value && (
                    <CopyButton label={step.copy} value={step.value} />
                  )}
                  {step.download && (
                    <a
                      href={step.download.href}
                      download={step.download.filename}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-[var(--line)] hover:border-[var(--accent)]/50 shrink-0"
                    >
                      {step.download.label}
                    </a>
                  )}
                </div>
                <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed mt-1">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
          <li className="px-5 py-3.5 bg-[var(--surface-2)]/40">
            <p className="text-[11.5px] text-[var(--ink-3)] leading-relaxed">
              <span className="font-semibold text-[var(--ink-2)]">
                If a table pastes as a row of pipe characters
              </span>{" "}
              you are in the Visual editor rather than the Code editor. Undo,
              switch, and paste again. If you would rather work in markdown —
              pasting into Google Docs or another editor first —{" "}
              <CopyButtonInline value={markdown} /> instead.
            </p>
          </li>
        </ol>
      )}
    </section>
  );
}

function CopyButtonInline({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="underline font-semibold text-[var(--accent)]"
    >
      {done ? "copied the markdown" : "copy the markdown"}
    </button>
  );
}
