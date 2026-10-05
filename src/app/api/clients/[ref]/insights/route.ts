import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { addInsight, deleteInsight, isAttached, listInsights, relevantInsights, updateInsight, type Insight } from "@/lib/insights";
import { getRun } from "@/lib/store";

/**
 * Attaching to a post also attaches to its topic, so a rewrite — or a new
 * post on the same topic — still gets the data.
 */
async function withTopics(ref: string, body: Partial<Insight>): Promise<Partial<Insight>> {
  if (!body.runIds?.length) return body;
  const topicIds = new Set(body.topicIds ?? []);
  for (const id of body.runIds) {
    const run = await getRun(id, ref).catch(() => null);
    if (run?.brief.seedTopicId) topicIds.add(run.brief.seedTopicId);
  }
  return { ...body, topicIds: [...topicIds] };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gate(ref: string) {
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return null;
}

/**
 * GET lists everything. With ?topicId / ?runId (and ?subject, the post's
 * title) it also says which are attached to that post and which the writer
 * will pick up anyway because they match its topic words — the same
 * selection the writer makes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const g = gate(ref);
  if (g) return g;
  const q = new URL(req.url).searchParams;
  const all = await listInsights(ref);
  const runId = q.get("runId") ?? undefined;
  let topicId = q.get("topicId") ?? undefined;
  let subject = q.get("subject") ?? "";
  if (runId) {
    const run = await getRun(runId, ref).catch(() => null);
    topicId = topicId ?? run?.brief.seedTopicId;
    subject = subject || [run?.brief.title, ...(run?.brief.keywords ?? []), run?.brief.pillar].filter(Boolean).join(" ");
  }
  if (!runId && !topicId) return NextResponse.json({ insights: all });
  const to = { topicId, runId };
  const used = relevantInsights(all, subject, 10, to);
  return NextResponse.json({
    insights: all,
    topicId: topicId ?? null,
    attached: all.filter((x) => isAttached(x, to)).map((x) => x.id),
    used: used.map((x) => x.id),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const g = gate(ref);
  if (g) return g;
  try {
    const body = await withTopics(ref, (await req.json()) as Partial<Insight>);
    return NextResponse.json({ insight: await addInsight(ref, body) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const g = gate(ref);
  if (g) return g;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const x = await updateInsight(ref, id, await withTopics(ref, (await req.json()) as Partial<Insight>));
    return x ? NextResponse.json({ insight: x }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const g = gate(ref);
  if (g) return g;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await deleteInsight(ref, id))
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
