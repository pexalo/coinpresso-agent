import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { readSettings } from "@/lib/settings";
import { listCategories, testConnection } from "@/lib/wordpress";
import { blogArchiveStats } from "@/lib/blog-import";
import { PILLARS } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connection status, what the archive holds, and the live category list.
 *
 * The category list is fetched rather than hardcoded so a renamed or deleted
 * category shows up as a broken mapping instead of silently filing drafts
 * somewhere nobody looks.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const settings = await readSettings(ref);
  const cfg = {
    siteUrl: settings.wordpress.siteUrl,
    username: settings.wordpress.username,
    appPassword: settings.wordpress.appPassword,
  };

  const [connection, stats] = await Promise.all([
    testConnection(cfg),
    blogArchiveStats(),
  ]);

  let categories: Awaited<ReturnType<typeof listCategories>> = [];
  let categoryError: string | null = null;
  if (connection.reachable) {
    try {
      categories = await listCategories(cfg);
    } catch (e) {
      categoryError = e instanceof Error ? e.message : String(e);
    }
  }

  const mappedIds = new Set(
    PILLARS.map((p) => p.wp?.id).filter((x): x is number => Boolean(x))
  );

  return NextResponse.json({
    connection,
    stats,
    siteUrl: settings.wordpress.siteUrl,
    username: settings.wordpress.username,
    hasAppPassword: Boolean(settings.wordpress.appPassword),
    lastImportAt: settings.wordpress.lastImportAt ?? null,
    lastImportCount: settings.wordpress.lastImportCount ?? null,
    categoryError,
    mapping: PILLARS.map((p) => {
      const live = p.wp ? categories.find((c) => c.id === p.wp!.id) : undefined;
      return {
        pillar: p.id,
        pillarName: p.name,
        hub: p.hub,
        wpId: p.wp?.id ?? null,
        wpSlug: p.wp?.slug ?? null,
        liveName: live?.name ?? null,
        livePosts: live?.count ?? null,
        // A mapping that no longer resolves is the failure worth surfacing:
        // drafts would still be created, just filed nowhere useful.
        ok: Boolean(p.wp && live),
      };
    }),
    // Categories carrying real volume that no pillar plans for. Not a bug —
    // but it is the shape of the blog the planner cannot see.
    unmapped: categories
      .filter((c) => !mappedIds.has(c.id) && c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  });
}
