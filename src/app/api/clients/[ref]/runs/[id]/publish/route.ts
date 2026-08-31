import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { getRun, saveRun } from "@/lib/store";
import { gateConfig, readSettings } from "@/lib/settings";
import { getRecord } from "@/lib/approval-store";
import { fingerprint, gateState } from "@/lib/approval";
import { createDraft } from "@/lib/wordpress";
import { wpCategoryFor } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send an approved blog post to WordPress as a draft.
 *
 * Three gates before anything is created, and none of them is optional:
 * the client must hold the blog module, the run must belong to that client,
 * and the run must be on the blog track. A wire release must never be pushed
 * to coinpresso.io — it carries a dateline, a boilerplate block and an
 * investment disclaimer, and it is selling somebody else's token.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;

  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const run = await getRun(id, ref);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.brief.track !== "blog") {
    return NextResponse.json(
      {
        error:
          "This run is a wire release, not a blog post. Wire releases carry a dateline, boilerplate and a disclaimer, and belong on a newswire rather than on coinpresso.io.",
      },
      { status: 400 }
    );
  }
  if (!run.draft) {
    return NextResponse.json(
      { error: "This run has no draft yet." },
      { status: 400 }
    );
  }

  const settings = await readSettings(ref);

  // The approval gate, checked again here rather than trusted from the release
  // step. This is the endpoint that actually creates something on coinpresso.io,
  // and it was previously reachable for any run with a draft — no approval
  // required at all. Re-checking also catches the case that matters most: a
  // piece released, then edited, then pushed. The signatures were given against
  // the old text and the fingerprint no longer matches, so this refuses.
  const { approvers, required } = gateConfig(settings);
  const gate = gateState(
    await getRecord(ref, id),
    approvers,
    required,
    fingerprint(run),
    true
  );
  if (!gate.released && !gate.canRelease) {
    return NextResponse.json(
      {
        ok: false,
        error: `Not approved for publishing. ${gate.reason}`,
        gate,
      },
      { status: 409 }
    );
  }

  const result = await createDraft(
    {
      siteUrl: settings.wordpress.siteUrl,
      username: settings.wordpress.username,
      appPassword: settings.wordpress.appPassword,
    },
    { run, categoryId: wpCategoryFor(run.brief.pillar) }
  );

  if (result.ok && result.editUrl) {
    // Reuse docUrl — it is the run's "where this ended up" field, and the run
    // page already renders a link from it.
    run.docUrl = result.editUrl;
    await saveRun(run);
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
