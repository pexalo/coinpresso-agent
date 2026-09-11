import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { listImages, readImage } from "@/lib/image-store";
import { uploadImageToDrive } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drive-safe filename.
 *
 * Slashes would be read as a path, and the leading/trailing junk that falls
 * out of a headline with a colon in it looks like a mistake in a folder
 * listing. Long titles are trimmed on a word so the name stays readable.
 */
function clean(text: string, max = 90): string {
  const flat = text
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max).trim();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string; id: string }> }
) {
  const { ref, id } = await params;
  const run = await getRun(id, ref);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  let versionId: string | undefined;
  try {
    versionId = ((await req.json()) as { versionId?: string }).versionId;
  } catch {
    // Fall through to the newest.
  }

  const versions = await listImages(ref, id);
  const version = versionId
    ? versions.find((v) => v.id === versionId)
    : versions[0];
  if (!version) {
    return NextResponse.json({ error: "No image to upload yet." }, { status: 409 });
  }

  // The featured image is only finished once the template has been drawn over
  // it, so prefer the composite. A section image has no overlay — the scene
  // is the final file.
  const composed = version.section ? null : await readImage(ref, id, version.id, "composed");
  const bytes = composed ?? (await readImage(ref, id, version.id, "scene"));
  if (!bytes) {
    return NextResponse.json({ error: "That image's file is missing." }, { status: 404 });
  }
  if (!version.section && !composed) {
    return NextResponse.json(
      {
        error:
          "Press “Use this one” first — that draws the logo and title over the scene. " +
          "Uploading now would put the untitled background in Drive.",
      },
      { status: 409 }
    );
  }

  const title = clean(run.draft?.headline ?? run.brief.title);
  // The client's naming convention. The section is appended because a post can
  // have several section images and Drive will happily hold two files with the
  // same name — which is how you end up not knowing which is which.
  const name = version.section
    ? `Section image - ${title} - ${clean(version.section, 50)}.png`
    : `Feature image - ${title}.png`;

  try {
    const result = await uploadImageToDrive(name, bytes);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[image-drive]", message);
    return NextResponse.json({ error: message }, { status: 424 });
  }
}
