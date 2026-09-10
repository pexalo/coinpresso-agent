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
import { callClaude } from "../providers/anthropic";
import { MODELS } from "../models";
import { SCENE_RULES, SECTION_RULES, CHART_REQUEST, PALETTE } from "../blog-image";

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

  // Claude, not GPT. The scene brief is a writing task, and putting it on the
  // same provider as the image call means one exhausted balance takes out both
  // halves of the designer at once — which is exactly how this first failed.
  const res = await callClaude({
    model: MODELS.strategy,
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

    // Say what to do, not just what happened. The quota case in particular is
    // worth naming clearly, because the same key runs the reviewer: an
    // exhausted balance stops blog runs as well as images, and the operator
    // should hear that here rather than discover it on the next Write.
    if (res.status === 429 && /insufficient_quota|credit_balance/i.test(detail)) {
      throw new Error(
        "The OpenAI account has no credits left, so no image can be generated. " +
          "Add credits at platform.openai.com → Settings → Billing. " +
          "Worth knowing: the same key runs the reviewer agent, so blog runs will " +
          "fail at the review stage until this is topped up."
      );
    }
    if (res.status === 429) {
      throw new Error(
        `OpenAI is rate limiting this account. Wait a minute and try again. It said: ${detail.slice(0, 200)}`
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "OpenAI rejected the API key for image generation. Check OPENAI_API_KEY on Railway, " +
          "and that the key's project has image generation enabled."
      );
    }
    if (res.status === 400 && /model/i.test(detail)) {
      throw new Error(
        `This deployment asked for the "${IMAGE_MODEL}" image model and OpenAI does not offer it on this account. ` +
          `Set OPENAI_IMAGE_MODEL on Railway to one you do have. OpenAI said: ${detail.slice(0, 250)}`
      );
    }
    throw new Error(`Image generation failed (${res.status}). OpenAI said: ${detail.slice(0, 400)}`);
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


/**
 * A section image, from a brief a person wrote.
 *
 * The section heading is passed as context so the model knows what the picture
 * sits next to, but the brief leads: if someone has taken the trouble to say
 * what they want, the agent should draw that rather than its own idea.
 */
export async function generateSectionImage(
  run: Run,
  section: string,
  brief: string
): Promise<SceneResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on this deployment.");

  const clean = brief.trim();
  if (clean.length < 8) {
    throw new Error("Give the designer a sentence to work from — what should the picture show?");
  }

  // Refuse charts rather than invent one. See CHART_REQUEST for why.
  if (CHART_REQUEST.test(clean)) {
    throw new Error(
      "This brief asks for a chart, and the designer will not draw one. An image model " +
        "invents the numbers and draws them convincingly, which is exactly the failure " +
        "this pipeline rejects in the writing. Build the chart from real figures — a " +
        "screenshot from the source, or a chart tool — and place it by hand. If you want " +
        "an illustration of the idea behind the data rather than the data itself, say " +
        "that instead: \"an isometric scene of a market expanding\", not \"a bar chart of market size\"."
    );
  }

  const prompt = [
    clean,
    "",
    `This illustrates the section "${section}" of a Coinpresso article about ${
      run.draft?.headline ?? run.brief.title
    }.`,
    "",
    "STYLE:",
    ...SECTION_RULES.map((r) => `- ${r}`),
    `- Ground in deep purple, around ${PALETTE.bgCenter} falling to ${PALETTE.bgEdge}`,
    `- Rim lights in violet ${PALETTE.gradientViolet} and teal ${PALETTE.gradientTeal}`,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
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
    if (res.status === 429 && /insufficient_quota|credit_balance/i.test(detail)) {
      throw new Error(
        "The OpenAI account has no credits left. Add credits at platform.openai.com → Settings → Billing."
      );
    }
    throw new Error(`Image generation failed (${res.status}). OpenAI said: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (!first) throw new Error("OpenAI returned no image.");
  const png = first.b64_json
    ? Buffer.from(first.b64_json, "base64")
    : Buffer.from(await (await fetch(first.url!)).arrayBuffer());

  return { prompt: clean, png, costUsd: COST_BY_QUALITY[IMAGE_QUALITY] ?? COST_BY_QUALITY.medium };
}
