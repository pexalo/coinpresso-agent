import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import { addInsight, deleteInsight, listInsights, updateInsight, type Insight } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gate(ref: string) {
  const client = getClient(ref);
  if (!client || !hasModule(client, "own-blog")) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return gate(ref) ?? NextResponse.json({ insights: await listInsights(ref) });
}

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const g = gate(ref);
  if (g) return g;
  try {
    const body = (await req.json()) as Partial<Insight>;
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
    const x = await updateInsight(ref, id, (await req.json()) as Partial<Insight>);
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
