// ---------------------------------------------------------------------------
// Minimal OpenAI Chat Completions client for the review stage.
//
// Routed by ./routing — direct to OpenAI, or through the Pexalo gateway. Same
// body either way.
// ---------------------------------------------------------------------------

import { openaiRoute, authHelp, type CallContext } from "./routing";

export interface GptCall {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Ask for a JSON object back. */
  json?: boolean;
  /** Who this call is for. Used by the gateway to attribute spend. */
  context?: CallContext;
}

export interface GptResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export async function callGpt(opts: GptCall): Promise<GptResult> {
  const route = openaiRoute(opts.context);

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens ?? 4000,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(route.url, {
    method: "POST",
    headers: route.headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(authHelp("OpenAI", route.mode, res.status));
  }
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
