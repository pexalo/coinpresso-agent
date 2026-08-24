import { NextResponse } from "next/server";
import { getBatch, progressOf } from "@/lib/batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const batch = await getBatch(id, ref);
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json({ ...batch, progress: progressOf(batch) });
}
