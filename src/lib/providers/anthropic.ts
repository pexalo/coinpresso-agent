// ---------------------------------------------------------------------------
// Minimal Anthropic Messages API client. No SDK dependency on purpose — this
// file is the whole integration surface, so folding it into Pexalo HQ means
// swapping one module rather than reconciling package trees.
// ---------------------------------------------------------------------------

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export interface ClaudeCall {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Enables the server-side web search tool for research stages. */
  webSearch?: boolean;
  temperature?: number;
}

export interface ClaudeResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** URLs the web_search tool actually surfaced, when enabled. */
  searchUrls: string[];
}

interface ContentBlock {
  type: string;
  text?: string;
  content?: unknown;
}

export async function callClaude(opts: ClaudeCall): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (opts.webSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }];
  }

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    content: ContentBlock[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = (json.content || [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");

  // Harvest the URLs the search tool returned so the link checker has a ledger
  // of what was genuinely retrieved, independent of what the model wrote down.
  const searchUrls: string[] = [];
  const walk = (v: unknown): void => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string") searchUrls.push(o.url);
      Object.values(o).forEach(walk);
    }
  };
  walk(json.content);

  return {
    text,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
    searchUrls: [...new Set(searchUrls)],
  };
}

/** Pull the first JSON object or array out of a model response. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model response");

  // Scan for the matching close bracket so trailing prose does not break parsing.
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
    }
  }
  throw new Error("Unbalanced JSON in model response");
}
