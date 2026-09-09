// ---------------------------------------------------------------------------
// The designer. Reads a finished draft, decides what the picture should show,
// and renders the scene — never the text, never a real logo.
//
// Two steps, deliberately. A cheap language call turns the article into a
// concrete scene brief, then the image call renders it. Going straight from
// headline to image gives you a picture of the words rather than a picture of
// the argument: "Schema Markup Checklist" becomes a clipboard, every time.
// Reading the sections gets you the thing the post is actually about.
// ---------------------------------------------------------------------------

import type { Run } from "../types";
import { callGpt } from "../providers/openai";
import { SCENE_RULES, PALETTE } from "../blog-image";

/** gpt-image-1 is deprecated on 23 Oct 2026; do not fall back to it. */
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
/** Landscape is both the right shape and cheaper than square on this model. */
const IMAGE_SIZE = "1536x1024";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium";

/** Published rates, landscape. Used for the spend log, not for billing. */
const COST_BY_QUALITY: Record<string, number> = {
  low: 0.011,
  medium: 0.041,
  high: 0.165,
};

export interface SceneResult {
  prompt: string;
  png: Buffer;
  costUsd: number;
}

/**
 * Ask for the subject of the picture, in objects rather than adjectives.
 *
 * The model is told to name things that can be modelled — a vault, a ledger, a
 * bridge — because "trust and authority" renders as nothing at all.
 */
async function sceneBrief(run: Run, nudge?: string): Promise<string> {
  const headings = (run.draft?.body.match(/^## (.+)$/gm) ?? [])
    .map((h) => h.slice(3))
    .filter((h) => h.toLowerCase() !== "faqs")
    .slice(0, 9);

  const ask = `You are art-directing the hero image for a Coinpresso blog post.

POST: ${run.draft?.headline ?? run.brief.title}
SECTIONS:
${headings.map((h) => `- ${h}`).join("\n")}

Describe ONE scene of 3D-rendered objects that carries the post's central
argument. Name physical objects a 3D artist could model. Abstractions like
"trust" or "visibility" render as nothing — give me the vault, the ledger, the
bridge, the magnifying glass, the stack of documents.

Three to five objects, no more. Say how they are arranged.
${nudge ? `\nThe operator asked for this change, and it takes priority: "${nudge}"` : ""}

Answer with the scene only, 40 words at most. No preamble, no title, no text
elements, no logos, no people.`;

  const res = await callGpt({
    model: "gpt-4.1",
    system: "You art-direct product illustration. You answer in plain concrete nouns.",
    user: ask,
    maxTokens: 200,
  });
  return res.text.trim().replace(/^["']|["']$/g, "");
}

export async function generateScene(run: Run, nudge?: string): Promise<SceneResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on this deployment.");
  if (!run.draft) throw new Error("This run has no draft to illustrate yet.");

  const scene = await sceneBrief(run, nudge);
  const prompt = [
    scene,
    "",
    "STYLE, which matters more than the subject:",
    ...SCENE_RULES.map((r) => `- ${r}`),
    `- Ground and atmosphere in deep purple, around ${PALETTE.bgCenter} falling to ${PALETTE.bgEdge}`,
    `- Rim lights in violet ${PALETTE.gradientViolet} and teal ${PALETTE.gradientTeal}`,
    "- Leave the left 45% of the frame quiet and dark: a title is placed there",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      n: 1,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Image generation failed (${res.status}). ${
        res.status === 400 && /model/i.test(detail)
          ? `The deployment asked for "${IMAGE_MODEL}". Set OPENAI_IMAGE_MODEL if that is not available on this account. `
          : ""
      }OpenAI said: ${detail.slice(0, 400)}`
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data?.[0];
  if (!first) throw new Error("OpenAI returned no image.");

  let png: Buffer;
  if (first.b64_json) {
    png = Buffer.from(first.b64_json, "base64");
  } else if (first.url) {
    const img = await fetch(first.url);
    png = Buffer.from(await img.arrayBuffer());
  } else {
    throw new Error("OpenAI returned neither image bytes nor a URL.");
  }

  return {
    prompt: scene,
    png,
    costUsd: COST_BY_QUALITY[IMAGE_QUALITY] ?? COST_BY_QUALITY.medium,
  };
}
