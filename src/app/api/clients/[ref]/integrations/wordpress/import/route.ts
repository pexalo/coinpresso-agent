import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { readSettings, writeSettings } from "@/lib/settings";
import { importBlog } from "@/lib/blog-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A full archive walk is several sequential requests to a live WordPress. */
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: { since?: string; maxPages?: number } = {};
  try {
    body = await req.json();
  } catch {
    // An import with no options is the common case.
  }

  const settings = await readSettings(ref);
  if (!settings.wordpress.siteUrl) {
    return NextResponse.json(
      { error: "No WordPress site URL is set. Add it in Settings." },
      { status: 400 }
    );
  }

  try {
    const progress = await importBlog(
      {
        siteUrl: settings.wordpress.siteUrl,
        username: settings.wordpress.username,
        appPassword: settings.wordpress.appPassword,
      },
      {
        since: body.since,
        maxPages: Math.min(Math.max(body.maxPages ?? 30, 1), 60),
      }
    );

    await writeSettings(ref, {
      wordpress: {
        ...settings.wordpress,
        lastImportAt: new Date().toISOString(),
        lastImportCount: progress.imported + progress.updated,
      },
    });

    return NextResponse.json(progress);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
