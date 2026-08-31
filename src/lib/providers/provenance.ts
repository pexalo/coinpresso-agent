// ---------------------------------------------------------------------------
// Where did this key actually come from?
//
// Next.js resolves environment variables in a fixed order and STOPS at the first
// place it finds one (node_modules/next/dist/docs/01-app/02-guides/
// environment-variables.md, "Environment Variable Load Order"):
//
//   1. process.env          <- the shell you ran npm from
//   2. .env.<NODE_ENV>.local
//   3. .env.local
//   4. .env.<NODE_ENV>
//   5. .env
//
// process.env is FIRST. So a stale ANTHROPIC_API_KEY exported in ~/.zshrc
// silently overrides .env.local, and every fix applied to the file changes
// nothing at all. The person edits the key, restarts, gets the same 401, edits
// it again, and concludes the app is broken — because the one thing they are
// looking at is the one thing not being read.
//
// This is the single nastiest configuration failure in a Next app, and it is
// invisible from inside the process unless something goes and looks. So this
// does: it reads the .env files directly and compares them to what actually
// landed in process.env.
//
// Node-only — it touches the filesystem, so it must never be imported from
// anything that ends up in a client bundle. It is used by /api/health alone.
// ---------------------------------------------------------------------------

import fs from "node:fs/promises";
import path from "node:path";

export type Source =
  | "shell"
  | "env-file"
  | "shell-shadowing-file"
  | "absent";

export interface Provenance {
  variable: string;
  source: Source;
  /** Which file the value would have come from, when one exists. */
  file?: string;
  /** Safe to display: length and last four only, never the value. */
  shape?: string;
  detail: string;
}

const FILES = [".env.development.local", ".env.local", ".env.development", ".env"];

function shapeOf(v: string): string {
  const trimmed = v.trim();
  const bits = [`${v.length} chars`, `ends "${v.slice(-4)}"`];
  if (v !== trimmed) bits.push("HAS SURROUNDING WHITESPACE");
  if (/^["']|["']$/.test(trimmed)) bits.push("IS QUOTED — remove the quotes");
  if (/\r/.test(v)) bits.push("CONTAINS A CARRIAGE RETURN — file has Windows line endings");
  return bits.join(", ");
}

/** Minimal .env parser. Only needs to find one key, not to be dotenv. */
function readVar(contents: string, name: string): string | null {
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== name) continue;
    return line.slice(eq + 1);
  }
  return null;
}

async function fileValue(
  name: string
): Promise<{ file: string; value: string } | null> {
  for (const f of FILES) {
    try {
      const contents = await fs.readFile(path.join(process.cwd(), f), "utf8");
      const v = readVar(contents, name);
      if (v !== null) return { file: f, value: v };
    } catch {
      // Missing file is the normal case.
    }
  }
  return null;
}

export async function provenanceOf(name: string): Promise<Provenance> {
  const live = process.env[name];
  const onDisk = await fileValue(name);

  if (!live && !onDisk) {
    return {
      variable: name,
      source: "absent",
      detail: `${name} is not set anywhere — no .env file defines it and nothing exported it.`,
    };
  }

  if (live && !onDisk) {
    return {
      variable: name,
      source: "shell",
      shape: shapeOf(live),
      detail: `${name} is coming from the SHELL, not from any .env file — no .env file in this project defines it. Something exported it, most likely a line in ~/.zshrc. If that value is stale, creating .env.local will NOT fix it: Next.js reads process.env first and stops there. Run: unset ${name}`,
    };
  }

  if (!live && onDisk) {
    return {
      variable: name,
      source: "env-file",
      file: onDisk.file,
      shape: shapeOf(onDisk.value),
      detail: `${name} is defined in ${onDisk.file} but is not in process.env — the server has not picked it up. Restart the dev server; Next.js reads env files at boot only.`,
    };
  }

  // Both present. Whether that is a problem depends on whether they agree.
  const same = live!.trim() === onDisk!.value.trim();
  if (same) {
    return {
      variable: name,
      source: "env-file",
      file: onDisk!.file,
      shape: shapeOf(live!),
      detail: `${name} is loaded from ${onDisk!.file}.`,
    };
  }

  return {
    variable: name,
    source: "shell-shadowing-file",
    file: onDisk!.file,
    shape: shapeOf(live!),
    detail: `${name} is set in BOTH the shell and ${onDisk!.file}, and they differ — the SHELL value is winning, because Next.js reads process.env first and stops there. Editing ${onDisk!.file} will change nothing until you remove the export. Run: unset ${name} (and delete the line from ~/.zshrc so a new terminal does not bring it back), then restart.`,
  };
}

export async function credentialProvenance(): Promise<Provenance[]> {
  return Promise.all(
    ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"].map(provenanceOf)
  );
}
