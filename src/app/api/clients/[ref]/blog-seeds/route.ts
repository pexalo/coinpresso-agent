import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import {
  addTopics,
  listSeeds,
  markUsed,
  removeTopic,
  setStandingKeywords,
  updateTopic,
  type NewSeedTopic,
} from "@/lib/blog-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gated on the own-blog module, not just on the client existing.
 *
 * Seed topics are blog-only by definition — the wire track takes its subjects
 * from a campaign's catalysts, not from a wish list — so a client without the
 * module has no business reading or writing this.
 */
async function guard(ref: string) {
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) return null;
  return client;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!(await guard(ref))) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return NextResponse.json(await listSeeds(ref));
}

interface PostBody {
  /** Add one or many topics. */
  topics?: NewSeedTopic[];
  /** Replace the standing keyword list. */
  standingKeywords?: string[];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!(await guard(ref))) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  let seeds = await listSeeds(ref);
  if (Array.isArray(body.standingKeywords)) {
    seeds = await setStandingKeywords(ref, body.standingKeywords);
  }
  if (Array.isArray(body.topics) && body.topics.length) {
    // A topic can arrive parked — an import knows some rows are not blog posts —
    // but never arrive already "used". Used means a batch wrote it, and letting
    // a create claim that would put a post in the written list that nothing
    // wrote, with no batch to trace it to.
    seeds = await addTopics(
      ref,
      body.topics.map((t) => ({
        ...t,
        status: t.status === "parked" ? ("parked" as const) : ("queued" as const),
      }))
    );
  }
  return NextResponse.json(seeds);
}

interface PatchBody {
  id?: string;
  topic?: string;
  keywords?: string[];
  notes?: string;
  referenceUrl?: string;
  linkTarget?: string;
  pillar?: string;
  status?: "queued" | "used" | "parked";
  /** Marking a whole selection used, when a plan built on them is sent to write. */
  usedIds?: string[];
  batchId?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!(await guard(ref))) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  if (Array.isArray(body.usedIds)) {
    return NextResponse.json(
      await markUsed(ref, body.usedIds, body.batchId ?? "unknown")
    );
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { id, usedIds: _u, batchId: _b, ...patch } = body;
  void _u;
  void _b;
  return NextResponse.json(await updateTopic(ref, id, patch));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!(await guard(ref))) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  return NextResponse.json(await removeTopic(ref, id));
}
