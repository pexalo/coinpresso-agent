import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { generateScene } from "@/lib/agents/designer";
import {
  listImages,
  readImage,
  saveImage,
  markComposed,
  type ImageVersion,
} from "@/lib/image-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the versions, or return one image's bytes with ?v=<id>. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const url = new URL(req.url);
  const version = url.searchParams.get("v");
  const kind = url.searchParams.get("kind") === "composed" ? "composed" : "scene";

  if (!version) {
    return NextResponse.json({ versions: await listImages(ref, id) });
  }

  const bytes = await readImage(ref, id, version, kind);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/png",
      // Version ids are unique per generation, so a hit is always the same
      // bytes. The browser re-drawing the canvas should not re-download.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

/** Generate a new scene. `nudge` steers a regenerate. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (!run.draft) {
    return NextResponse.json(
      { error: "Write the post first — the designer reads the draft to decide what to show." },
      { status: 409 }
    );
  }

  let nudge: string | undefined;
  try {
    nudge = ((await req.json()) as { nudge?: string }).nudge?.trim() || undefined;
  } catch {
    // No body is fine — that is a first generation.
  }

  try {
    const scene = await generateScene(run, nudge);
    const version: ImageVersion = {
      id: `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      prompt: scene.prompt,
      nudge,
      costUsd: scene.costUsd,
    };
    await saveImage(ref, id, version, scene.png, "scene");
    return NextResponse.json({ version, versions: await listImages(ref, id) });
  } catch (err) {
    // 424 rather than 5xx: the edge replaces a 5xx body with its own page and
    // the real reason never reaches the operator.
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[designer]", message);
    return NextResponse.json({ error: message }, { status: 424 });
  }
}

/** Store the finished composite the browser produced. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  let body: { versionId?: string; png?: string };
  try {
    body = (await req.json()) as { versionId?: string; png?: string };
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const { versionId, png } = body;
  if (!versionId || !png) {
    return NextResponse.json(
      { error: "versionId and png are both required" },
      { status: 400 }
    );
  }

  const versions = await listImages(ref, id);
  const version = versions.find((v) => v.id === versionId);
  if (!version) return NextResponse.json({ error: "Unknown version" }, { status: 404 });

  const bytes = Buffer.from(png.replace(/^data:image\/png;base64,/, ""), "base64");
  await saveImage(ref, id, version, bytes, "composed");
  await markComposed(ref, id, versionId);
  return NextResponse.json({ ok: true });
}
