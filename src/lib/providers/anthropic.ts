// ---------------------------------------------------------------------------
// Minimal Anthropic Messages API client. No SDK dependency on purpose — this
// file is the whole integration surface, so folding it into Pexalo HQ means
// swapping one module rather than reconciling package trees.
//
// Where the request GOES is decided by ./routing — either straight to Anthropic
// with a key from the environment, or to the Pexalo gateway with a service
// token. The body is identical either way, deliberately: a gateway that
// reshapes the payload is a place the two modes can diverge and return
// different output from the same prompt.
// ---------------------------------------------------------------------------

import { anthropicRoute, authHelp, type CallContext } from "./routing";
import { acceptsTemperature } from "../model-registry";

export interface ClaudeCall {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** Enables the server-side web search tool for research stages. */
  webSearch?: boolean;
  /**
   * A PREFERENCE, not a guarantee. Newer Anthropic models reject the parameter
   * outright, so it is dropped for those rather than failing the call — see the
   * note on the retry below. Call sites state the sampling they want and do not
   * have to track which models still honour it.
   */
  temperature?: number;
  /** Who this call is for. Used by the gateway to attribute spend. */
  context?: CallContext;
}

export interface ClaudeResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** Why the model stopped — "end_turn", "max_tokens", "tool_use"… */
  stopReason?: string;
  /** Which kinds of content block came back, for diagnosing an empty reply. */
  blockTypes?: string[];
  /** URLs the web_search tool actually surfaced, when enabled. */
  searchUrls: string[];
  /**
   * How many billable searches the server-side tool actually performed.
   *
   * Reported by the API in usage.server_tool_use, and billed SEPARATELY from
   * tokens at $10 per 1,000. Counting the URLs instead would be wrong — one
   * search returns many URLs — so this is taken from the usage block or not
   * counted at all.
   */
  searchRequests: number;
  /** Input tokens written INTO the cache on this call, billed at 1.25×. */
  cacheWriteTokens?: number;
  /** Input tokens served FROM the cache on this call, billed at 0.1×. */
  cacheReadTokens?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  content?: unknown;
}

/**
 * Does this 400 mean "you sent temperature and I don't take it"?
 *
 * Matched on the message text because the API gives no machine-readable code
 * for it — the error type is the generic `invalid_request_error`. Deliberately
 * narrow: it must name the parameter AND say it is unwanted, so an unrelated
 * 400 is never answered by silently changing the request and trying again.
 */
/**
 * Does this 400 mean "you sent a thinking parameter I don't take"?
 *
 * Same shape as the temperature check below, for the same reason: older models
 * predating the thinking parameter may reject it outright, and the right
 * response is to drop the field — those models never think uninvited anyway,
 * so removing the switch-off changes nothing.
 */
function rejectsThinking(detail: string): boolean {
  const d = detail.toLowerCase();
  if (!d.includes("thinking")) return false;
  return (
    d.includes("not supported") ||
    d.includes("unsupported") ||
    d.includes("unexpected") ||
    d.includes("invalid") ||
    d.includes("extra")
  );
}

function rejectsTemperature(detail: string): boolean {
  const d = detail.toLowerCase();
  if (!d.includes("temperature")) return false;
  return (
    d.includes("deprecated") ||
    d.includes("not supported") ||
    d.includes("unsupported") ||
    d.includes("unexpected")
  );
}

export async function callClaude(opts: ClaudeCall): Promise<ClaudeResult> {
  const route = anthropicRoute(opts.context);

  const buildBody = (
    withTemperature: boolean,
    withThinkingOff: boolean
  ): Record<string, unknown> => {
    // The system prompt is the one part of a call that is byte-identical every
    // time a stage runs: the playbook, the constraints, the exemplars. Marking
    // it cacheable means the second and subsequent calls in a batch pay a tenth
    // for it. The writer's system block is the largest in the system and a batch
    // of five posts sends it five times, so this is the biggest single input
    // saving available without changing a word of any prompt.
    //
    // Below roughly a thousand tokens the provider will not cache at all. It
    // does not error — the breakpoint is simply ignored — so the threshold here
    // only avoids asking for something that cannot happen; it is not a
    // correctness boundary.
    const cacheable = opts.system.length > 4000;
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: cacheable
        ? [
            {
              type: "text",
              text: opts.system,
              cache_control: { type: "ephemeral" },
            },
          ]
        : opts.system,
      messages: [{ role: "user", content: opts.user }],
    };
    if (withTemperature && typeof opts.temperature === "number") {
      body.temperature = opts.temperature;
    }
    // THINKING IS EXPLICITLY TURNED OFF, and this line is why the balance
    // drained. Newer Anthropic models reason by default when the request does
    // not say otherwise, the reasoning arrives as `thinking` blocks, and every
    // thinking token is billed at the OUTPUT rate. This app never asked for
    // thinking and never read those blocks — extractJson only reads text — so
    // each planner call was paying for thousands of tokens of deliberation,
    // then getting cut off at max_tokens before, or midway through, the JSON.
    // That is precisely the observed failure: "16,000 output tokens, ~1,750
    // characters of JSON". These are structured-output stages; the deliberation
    // belongs in the prompt design, not on the meter.
    if (withThinkingOff) {
      body.thinking = { type: "disabled" };
    }
    if (opts.webSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }];
    }
    return body;
  };

  const post = (withTemperature: boolean, withThinkingOff: boolean) =>
    fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify(buildBody(withTemperature, withThinkingOff)),
    });

  // The register says whether this model still takes temperature. Trusting it
  // alone would be brittle — it is a hand-maintained fact about a target that
  // moves whenever a provider ships — so a 400 that names a parameter we chose
  // to send (temperature, or the thinking switch-off) is retried once without
  // that parameter. First call right in the common case, self-correcting where
  // the register or the API surface has moved. At most two retries, and only
  // ever by REMOVING something; an unrelated 400 is never answered by mutating
  // the request and hoping.
  let sendTemperature = acceptsTemperature(opts.model);
  let sendThinkingOff = true;
  let res = await post(sendTemperature, sendThinkingOff);

  for (let retry = 0; res.status === 400 && retry < 2; retry++) {
    const detail = await res.text();
    const dropTemp =
      sendTemperature &&
      typeof opts.temperature === "number" &&
      rejectsTemperature(detail);
    const dropThinking = sendThinkingOff && rejectsThinking(detail);
    if (!dropTemp && !dropThinking) {
      throw new Error(`Anthropic 400: ${detail.slice(0, 400)}`);
    }
    if (dropTemp) sendTemperature = false;
    if (dropThinking) sendThinkingOff = false;
    res = await post(sendTemperature, sendThinkingOff);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(authHelp("Anthropic", route.mode, res.status));
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    content: ContentBlock[];
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: { web_search_requests?: number };
    };
  };

  // JOINED WITH NOTHING, deliberately. When web search runs, the API attaches
  // citations by SPLITTING the reply into many small text blocks — one logical
  // sentence, or one JSON string value, can arrive as three blocks cut at the
  // citation boundaries. They are fragments of one continuous text, not
  // paragraphs. The old "\n" join inserted a newline wherever a citation
  // happened to fall — including inside JSON string literals — which is how a
  // reply could be valid JSON as the model wrote it and unparseable by the
  // time it got here.
  const text = (json.content || [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");

  // WHY THE CALL STOPPED, carried out with the text.
  //
  // It was previously dropped, and the cost of that was a whole class of
  // failures arriving as the same four words: "No JSON found in model
  // response". A reply cut off at the token ceiling and a reply that contained
  // no text block at all are different problems with different fixes, and
  // neither is "the model did not return JSON" — which is what the message
  // said, and which sent you looking in the wrong place.
  const stopReason = json.stop_reason;
  const blockTypes = [...new Set((json.content || []).map((b) => b.type))];

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

  // WHY THE THREE INPUT COUNTERS ARE ADDED TOGETHER.
  //
  // With caching on, `input_tokens` counts only what was NOT served from cache.
  // Reporting that alone would make the cached calls look almost free and shrink
  // the recorded bill every time caching worked — the exact direction of error
  // this whole diagnostic exists to stop. So all three are summed: the total is
  // every input token the call actually involved.
  //
  // That slightly OVERSTATES cost, because a cache read is billed at a tenth and
  // a cache write at 1.25×, and this prices them all at the full rate. Erring
  // high is the correct direction for a spend figure. The split is carried out
  // separately so the costs page can show the real saving when it is wired up.
  const cacheWrite = json.usage?.cache_creation_input_tokens ?? 0;
  const cacheRead = json.usage?.cache_read_input_tokens ?? 0;

  return {
    stopReason,
    blockTypes,
    searchRequests: json.usage?.server_tool_use?.web_search_requests ?? 0,
    text,
    tokensIn: (json.usage?.input_tokens ?? 0) + cacheWrite + cacheRead,
    tokensOut: json.usage?.output_tokens ?? 0,
    cacheWriteTokens: cacheWrite,
    cacheReadTokens: cacheRead,
    searchUrls: [...new Set(searchUrls)],
  };
}

/** What a call cost, carried on a failure so it can still be recorded. */
export interface BilledUsage {
  tokensIn: number;
  tokensOut: number;
  searchRequests: number;
}

/**
 * Attach the cost of a call to an error thrown after it.
 *
 * A reply that arrives and then fails to parse HAS BEEN BILLED. Every route
 * here recorded spend only on the success path, so those tokens were charged by
 * the provider and appeared in no figure on the costs page — the same silent
 * gap the cost audit was written to close, reopened at exactly the moment it
 * matters most, because a stage that is failing is a stage being retried.
 */
export function billed(e: unknown, usage: BilledUsage): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  (err as Error & { usage?: BilledUsage }).usage = usage;
  return err;
}

/** The cost carried by an error, if it carries one. */
export function usageOf(e: unknown): BilledUsage | undefined {
  return (e as { usage?: BilledUsage } | null)?.usage;
}

/**
 * The first balanced {...} or [...] starting at `start`, or null if it never
 * closes. String-aware, so braces inside values do not count.
 */
function balancedSlice(s: string, start: number): string | null {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Conservative repair for the two ways a model corrupts its own JSON strings:
 * an unescaped quote inside a value ("The "best" agency"), and a raw newline
 * or tab inside a value. Both are already paid for by the time they get here,
 * so one deterministic salvage attempt is worth making before throwing the
 * reply away — a re-run costs real money and this does not.
 *
 * The quote heuristic: a `"` inside a string only ends it if the next
 * non-space character is one that can legally follow a string (, } ] : or
 * end of input). Anything else means it was a quote IN the text, and it gets
 * escaped. This can misjudge pathological values; that is acceptable for a
 * fallback that only runs after strict parsing has already failed.
 */
function repairJsonStrings(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      out += c;
      continue;
    }
    if (esc) { out += c; esc = false; continue; }
    if (c === "\\") { out += c; esc = true; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && /[ \t\r\n]/.test(s[j])) j++;
      const n = s[j];
      if (n === undefined || n === "," || n === "}" || n === "]" || n === ":") {
        inStr = false;
        out += c;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (c === "\n") { out += "\\n"; continue; }
    if (c === "\r") continue;
    if (c === "\t") { out += "\\t"; continue; }
    out += c;
  }
  return out;
}

/**
 * Pull the first JSON object or array out of a model response.
 *
 * `ctx` is optional and only used to explain a failure. Pass what the call
 * returned — why it stopped, what kinds of block came back — and the error can
 * name the actual problem instead of the symptom.
 */
export function extractJson<T>(
  text: string,
  ctx?: {
    /** Which pipeline stage asked, so the error names it. */
    stage?: string;
    stopReason?: string;
    blockTypes?: string[];
    maxTokens?: number;
    /** What the API said it produced. The gap between this and the text is the
     *  whole diagnosis when a reply is cut off. */
    tokensOut?: number;
  }
): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) {
    if (ctx?.stopReason === "max_tokens") {
      // The thinking case gets its own message because the remedy is opposite:
      // raising maxTokens feeds the thinking, it does not buy more JSON.
      if (ctx.blockTypes?.includes("thinking")) {
        throw new Error(
          `${ctx.stage ? `The ${ctx.stage} ` : "The "}model spent its whole ${ctx.maxTokens ?? ""} token budget on internal "thinking" blocks and was cut off before writing JSON — every one of those tokens is billed as output. The app now sends thinking:disabled; if you are seeing this, the running server predates that fix. Restart the dev server and run it again.`
        );
      }
      throw new Error(
        `${ctx.stage ? `The ${ctx.stage} ` : "The "}reply hit the ${ctx.maxTokens ?? "token"} limit before it wrote any JSON` +
          `${ctx.blockTypes?.length ? ` (blocks returned: ${ctx.blockTypes.join(", ")})` : ""}. ` +
          `Ask for fewer items, or raise maxTokens for this stage.`
      );
    }
    if (!text.trim()) {
      throw new Error(
        `The model returned no text at all` +
          `${ctx?.blockTypes?.length ? ` — only ${ctx.blockTypes.join(", ")} blocks` : ""}` +
          `${ctx?.stopReason ? `, stop_reason "${ctx.stopReason}"` : ""}. ` +
          `Nothing was parsed because there was nothing to parse.`
      );
    }
    throw new Error(
      `No JSON in the reply${ctx?.stopReason ? ` (stop_reason "${ctx.stopReason}")` : ""}. ` +
        `It began: ${JSON.stringify(text.slice(0, 160))}`
    );
  }

  // Scan for the matching close bracket so trailing prose does not break parsing.
  const raw = balancedSlice(candidate, start);
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch (parseErr) {
      // The reply closed but the parser rejected it — an unescaped quote, a
      // stray control character. The tokens are already paid for, so try the
      // deterministic repair before declaring the money wasted. The repair can
      // change where strings end, so the balance scan runs again on its output.
      const fixed = repairJsonStrings(candidate.slice(start));
      const fixedStart = fixed.search(/[[{]/);
      const rebalanced = fixedStart === -1 ? null : balancedSlice(fixed, fixedStart);
      if (rebalanced !== null) {
        try {
          return JSON.parse(rebalanced) as T;
        } catch {
          // fall through to the diagnostic below, reporting the ORIGINAL error
        }
      }
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const at = msg.match(/position (\d+)/);
      const pos = at ? Number(at[1]) : -1;
      const snippet =
        pos >= 0
          ? raw.slice(Math.max(0, pos - 90), pos + 90)
          : raw.slice(0, 180);
      throw new Error(
        `${ctx?.stage ? `The ${ctx.stage} ` : "The "}reply contained JSON the parser rejected — ${msg}. ` +
          `Around the failure: ${JSON.stringify(snippet)}. ` +
          `The automatic repair pass could not fix it either; re-running the stage is the only option.`
      );
    }
  }
  // REACHING HERE MEANS THE JSON STARTED AND NEVER CLOSED — which is what a
  // reply cut off mid-sentence looks like, and almost nothing else. The old
  // message named the symptom and hid both the cause and the stage that hit it,
  // when everything needed to say which was already in hand.
  const written = candidate.length - start;
  const where = ctx?.stage ? `The ${ctx.stage} ` : "The ";

  if (ctx?.stopReason === "max_tokens") {
    // WHERE THE BUDGET WENT is the actual question, and "N characters of JSON"
    // does not answer it. A reply that spent its whole allowance and returned
    // 1,750 characters of JSON has put roughly fifteen thousand tokens
    // somewhere else, and there are only two somewheres: prose written BEFORE
    // the JSON started, or content blocks that are not text at all. Those have
    // opposite fixes, so the message reports both rather than picking one.
    const preamble = start; // characters emitted before the first brace
    const textTokens = Math.round(candidate.length / 4); // rough, and enough
    const spentElsewhere =
      ctx.tokensOut && ctx.tokensOut - textTokens > 500
        ? ctx.tokensOut - textTokens
        : 0;

    throw new Error(
      `${where}reply was cut off at the ${ctx.maxTokens ?? "token"} limit. ` +
        `It produced ${ctx.tokensOut?.toLocaleString() ?? "?"} output tokens: ` +
        `${preamble.toLocaleString()} characters before the JSON started, ` +
        `then ${written.toLocaleString()} characters of JSON that never closed` +
        `${ctx.blockTypes?.length ? `, in ${ctx.blockTypes.join(" + ")} blocks` : ""}. ` +
        (preamble > 2000
          ? `Most of the budget went on prose before the JSON — the model is ` +
            `explaining itself instead of answering.`
          : spentElsewhere
            ? `About ${spentElsewhere.toLocaleString()} tokens are unaccounted for in the ` +
              `text, so they went to non-text blocks — raising the limit will buy more ` +
              `of those, not more answer.`
            : `Raise maxTokens for this stage, or ask it for less.`)
    );
  }
  throw new Error(
    `${where}JSON never closed after ${written.toLocaleString()} characters` +
      `${ctx?.stopReason ? ` (stop_reason "${ctx.stopReason}")` : ""}. ` +
      `It ended: ${JSON.stringify(candidate.slice(-120))}`
  );
}
