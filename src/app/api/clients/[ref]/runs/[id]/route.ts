import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import type { StageRecord } from "@/lib/types";
import { renderHtml, renderMarkdown, renderPlainText } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  // Ownership is asserted in the lookup — a run id from another client reads as
  // not found rather than leaking across tenants.
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...run,
    rendered: run.draft
      ? {
          plain: renderPlainText(run),
          markdown: renderMarkdown(run),
          html: renderHtml(run),
        }
      : null,
  });
}

interface PasteBody {
  /** Markdown body, H2s and prose. The FAQ section is parsed out of it. */
  markdown?: string;
  headline?: string;
  pastedBy?: string;
}

/**
 * Paste a hand-written draft over the generated one.
 *
 * This exists because a draft the client has already read and approved should
 * not have to be re-generated to enter the pipeline — regenerating costs money
 * and, worse, produces different words from the ones that were approved.
 *
 * It replaces the draft only. It does not touch the research, the brief or the
 * cost ledger, and it deliberately does not sign anything: replacing the body
 * changes the run's fingerprint, so any signature already given is invalidated
 * by the approval gate exactly as it would be for a regenerated draft. Whoever
 * pastes still has to get the run signed before it can be released.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let body: PasteBody;
  try {
    body = (await req.json()) as PasteBody;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const markdown = (body.markdown ?? "").trim();
  if (!markdown) {
    return NextResponse.json(
      { error: "Nothing to paste — send the draft as `markdown`." },
      { status: 400 }
    );
  }

  // An H1 at the top is the headline; the writer's own drafts carry one.
  let rest = markdown;
  let headline = body.headline?.trim() ?? run.draft?.headline ?? run.brief.title;
  const h1 = rest.match(/^#\s+(.+?)\s*$/m);
  if (h1 && rest.startsWith("#")) {
    if (!body.headline) headline = h1[1].trim();
    rest = rest.slice(h1[0].length).trim();
  }

  // Split the FAQ section off the body. The pipeline stores them separately and
  // renders them itself, so leaving them inline would publish them twice.
  const faqs: Array<{ q: string; a: string }> = [];
  const faqSplit = rest.split(/^##\s+FAQs?\s*$/m);
  if (faqSplit.length > 1) {
    rest = faqSplit[0].trim();
    const block = faqSplit.slice(1).join("\n").trim();
    const parts = block.split(/^\*\*(.+?)\*\*\s*$/m).slice(1);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const q = parts[i].trim();
      const a = parts[i + 1].trim();
      if (q && a) faqs.push({ q, a });
    }
  }

  const wordCount = rest.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

  const now = new Date().toISOString();
  run.draft = {
    headline,
    dateline: run.draft?.dateline ?? null,
    body: rest,
    faqs: faqs.length ? faqs : (run.draft?.faqs ?? []),
    tags: run.draft?.tags ?? [],
    wordCount,
  };
  // A pasted draft has not been reviewed by the reviewer agent, and the stale
  // verdict from the draft it replaced would be a lie about this one.
  run.review = undefined;
  run.status = "needs_review";
  run.updatedAt = now;
  run.stages = [
    ...run.stages,
    {
      id: "writer",
      label: "Draft pasted in",
      agent: "human",
      model: "—",
      status: "done",
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      inputSummary: `${wordCount} words pasted by ${body.pastedBy ?? "an operator"}`,
    } as StageRecord,
  ];

  await saveRun(run);
  return NextResponse.json({
    ok: true,
    headline,
    wordCount,
    faqs: run.draft.faqs.length,
  });
}
