import { NextResponse } from "next/server";
import { getClient, hasModule } from "@/lib/clients";
import {
  addFeedback,
  readFeedback,
  removeFeedback,
  setFeedbackActive,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Blog-only: the wire track has its own style profile and no client editor. */
function guard(ref: string) {
  const client = getClient(ref);
  return client && hasModule(client, "own-blog") ? client : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!guard(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  return NextResponse.json(await readFeedback(ref));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!guard(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  let body: { source?: string; rule?: string; date?: string; before?: string; after?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.rule?.trim()) {
    return NextResponse.json({ error: "The rule is empty" }, { status: 400 });
  }
  return NextResponse.json(
    await addFeedback(ref, {
      source: body.source ?? "",
      rule: body.rule,
      date: body.date,
      before: body.before,
      after: body.after,
    })
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!guard(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  let body: { id?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "id and active are required" }, { status: 400 });
  }
  return NextResponse.json(await setFeedbackActive(ref, body.id, body.active));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!guard(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json(await removeFeedback(ref, id));
}
