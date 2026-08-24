import { NextResponse } from "next/server";
import { getClient } from "@/lib/clients";
import {
  maskSettings,
  readSettings,
  writeSettings,
  type ClientSettings,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return NextResponse.json(maskSettings(await readSettings(ref)));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  if (!getClient(ref)) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  let patch: Partial<ClientSettings>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // The response is masked too — the token is write-only from the client's side.
  return NextResponse.json(maskSettings(await writeSettings(ref, patch)));
}
