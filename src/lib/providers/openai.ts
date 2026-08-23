// ---------------------------------------------------------------------------
// Minimal OpenAI Chat Completions client for the review stage.
// ---------------------------------------------------------------------------

const API = "https://api.openai.com/v1/chat/completions";

export interface GptCall {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Ask for a JSON object back. */
  json?: boolean;
}

export interface GptResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export async function callGpt(opts: GptCall): Promise<GptResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens ?? 4000,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: json.choices?.[0]?.message?.content ?? "",
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  };
}
