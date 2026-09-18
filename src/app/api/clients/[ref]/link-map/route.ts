// The client's internal-link map — see lib/link-map.ts for why it exists.
import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import { parseLinkMap, readLinkMap, saveLinkMap } from "@/lib/link-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  return NextResponse.json(await readLinkMap(ref));
}

/** Paste the mapping as CSV or TSV. Replaces the stored map. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  let body: { csv?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const { pages, skipped } = parseLinkMap(body.csv ?? "");
  if (!pages.length) {
    return NextResponse.json(
      {
        error:
          "No coinpresso.io pages found. The first row should be a header with a URL column and one or more anchor/keyword columns; each row one page.",
        skipped,
      },
      { status: 400 }
    );
  }
  const saved = await saveLinkMap(ref, pages, body.source?.trim() || undefined);
  return NextResponse.json({ ...saved, skipped });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  return NextResponse.json(await saveLinkMap(ref, [], undefined));
}
