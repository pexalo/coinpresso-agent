// ---------------------------------------------------------------------------
// Generated images, on the data volume.
//
// Kept as files rather than inside the run JSON because a run is read on every
// dashboard poll and a base64 PNG in it would be re-parsed a hundred times an
// hour for no reason. The run holds ids; the bytes live here.
//
// Every version is kept. Regenerating is cheap and opinions change, so the
// third attempt overwriting the second one somebody liked is a bad trade.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./data-dir";

const DIR = dataDir("images");

export interface ImageVersion {
  id: string;
  createdAt: string;
  /**
   * Which H2 this illustrates, or absent for the featured image. Section
   * images are briefed by a person rather than derived from the draft, so
   * they live alongside the hero rather than replacing it.
   */
  section?: string;
  /** The brief the operator wrote, for a section image. */
  brief?: string;
  /** The scene brief the designer wrote, kept so a good one can be reused. */
  prompt: string;
  /** What the operator asked for on a regenerate, if anything. */
  nudge?: string;
  costUsd: number;
  /** Set once the browser has composited the template over the scene. */
  composed?: boolean;
}

function runDir(clientRef: string, runId: string): string {
  // Both segments are ids we generate, but a path is a path: refuse anything
  // that could climb out of the images directory.
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");
  return path.join(DIR, safe(clientRef), safe(runId));
}

export async function saveImage(
  clientRef: string,
  runId: string,
  version: ImageVersion,
  bytes: Buffer,
  kind: "scene" | "composed" = "scene"
): Promise<void> {
  const dir = runDir(clientRef, runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${version.id}.${kind}.png`), bytes);
  const meta = await listImages(clientRef, runId);
  const next = [version, ...meta.filter((v) => v.id !== version.id)];
  await fs.writeFile(
    path.join(dir, "versions.json"),
    JSON.stringify(next, null, 2)
  );
}

export async function listImages(
  clientRef: string,
  runId: string
): Promise<ImageVersion[]> {
  try {
    const raw = await fs.readFile(
      path.join(runDir(clientRef, runId), "versions.json"),
      "utf8"
    );
    return JSON.parse(raw) as ImageVersion[];
  } catch {
    return [];
  }
}

export async function readImage(
  clientRef: string,
  runId: string,
  id: string,
  kind: "scene" | "composed" = "scene"
): Promise<Buffer | null> {
  try {
    const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
    return await fs.readFile(path.join(runDir(clientRef, runId), `${safe}.${kind}.png`));
  } catch {
    return null;
  }
}

export async function markComposed(
  clientRef: string,
  runId: string,
  id: string
): Promise<void> {
  const versions = await listImages(clientRef, runId);
  const next = versions.map((v) => (v.id === id ? { ...v, composed: true } : v));
  await fs.writeFile(
    path.join(runDir(clientRef, runId), "versions.json"),
    JSON.stringify(next, null, 2)
  );
}
