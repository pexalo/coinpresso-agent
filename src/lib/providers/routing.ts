// ---------------------------------------------------------------------------
// Where model calls actually go.
//
// Two modes, and the provider modules do not care which is active — they ask
// this file for a URL and a set of headers, and post the same body either way.
//
//   DIRECT   — straight to api.anthropic.com and api.openai.com with the
//              provider keys from the environment. On Railway those come from
//              project-level shared variables, so every Pexalo service reads one
//              set rather than each carrying its own copy.
//
//   GATEWAY  — to Pexalo HQ, which holds the provider keys and forwards the
//              call. This app then holds no provider credential at all: it
//              authenticates as itself with a service token, and HQ attributes
//              the spend to the client on whose behalf it was made.
//
// Why both, rather than picking one. Shared variables are the right answer today
// and the wrong answer at ten clients: every service holding the keys means ten
// places to rotate, ten places a leak can come from, and no single view of spend
// across the estate. The gateway is the right end state. Building the seam now
// means that switch is an environment change rather than a rewrite of every
// call site — and the seam costs almost nothing, because it is one function.
//
// The request bodies are deliberately UNCHANGED between modes. The gateway is a
// pass-through by contract, not a translation layer; anything that reshapes the
// payload is a place the two modes can silently diverge and produce different
// output from the same prompt.
// ---------------------------------------------------------------------------

export type RoutingMode = "direct" | "gateway";

export interface Route {
  url: string;
  headers: Record<string, string>;
  mode: RoutingMode;
}

/**
 * Which client this call is being made for.
 *
 * Only meaningful in gateway mode, where HQ needs it to attribute spend and to
 * apply per-client rate limits. Passing it in direct mode is harmless — the
 * providers ignore unknown headers — and keeps the call sites identical.
 */
export interface CallContext {
  clientRef?: string;
  runId?: string;
  stage?: string;
}

function gatewayBase(): string | null {
  const raw = process.env.PEXALO_AI_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function serviceToken(): string {
  return process.env.PEXALO_SERVICE_TOKEN?.trim() ?? "";
}

/**
 * Gateway mode requires BOTH the URL and the token. A URL with no token would
 * fail on every call with a 401 that looks like a provider problem, which is a
 * miserable thing to debug — better to stay in direct mode and say so.
 */
export function routingMode(): RoutingMode {
  return gatewayBase() && serviceToken() ? "gateway" : "direct";
}

/** Set when the gateway is half-configured, for the health endpoint to report. */
export function routingWarning(): string | null {
  const url = gatewayBase();
  const token = serviceToken();
  if (url && !token) {
    return "PEXALO_AI_URL is set but PEXALO_SERVICE_TOKEN is not, so calls are going direct to the providers. Set both, or neither.";
  }
  if (!url && token) {
    return "PEXALO_SERVICE_TOKEN is set but PEXALO_AI_URL is not, so calls are going direct to the providers. Set both, or neither.";
  }
  return null;
}

function contextHeaders(ctx?: CallContext): Record<string, string> {
  const h: Record<string, string> = {};
  if (ctx?.clientRef) h["x-pexalo-client"] = ctx.clientRef;
  if (ctx?.runId) h["x-pexalo-run"] = ctx.runId;
  if (ctx?.stage) h["x-pexalo-stage"] = ctx.stage;
  return h;
}

export function anthropicRoute(ctx?: CallContext): Route {
  const base = gatewayBase();
  if (base && serviceToken()) {
    return {
      mode: "gateway",
      url: `${base}/ai/anthropic/v1/messages`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken()}`,
        ...contextHeaders(ctx),
      },
    };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return {
    mode: "direct",
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      ...contextHeaders(ctx),
    },
  };
}

export function openaiRoute(ctx?: CallContext): Route {
  const base = gatewayBase();
  if (base && serviceToken()) {
    return {
      mode: "gateway",
      url: `${base}/ai/openai/v1/chat/completions`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken()}`,
        ...contextHeaders(ctx),
      },
    };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return {
    mode: "direct",
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...contextHeaders(ctx),
    },
  };
}

/**
 * Whether this app can make model calls at all.
 *
 * In gateway mode the provider keys are irrelevant — HQ holds them — so
 * demanding them here would put a correctly configured deployment into mock
 * mode. This is the check `mockMode()` defers to.
 */
export function canCallModels(): { anthropic: boolean; openai: boolean } {
  if (routingMode() === "gateway") {
    return { anthropic: true, openai: true };
  }
  return {
    anthropic: usableKey(process.env.ANTHROPIC_API_KEY),
    openai: usableKey(process.env.OPENAI_API_KEY),
  };
}

/**
 * A key is only real if it is present AND not one of the placeholders that
 * copying the env template leaves behind. Checking presence alone flips the app
 * to live mode on a file full of `sk-ant-...`, and the failure surfaces as a 401
 * three minutes into the first run rather than as "you have no keys".
 */
export function usableKey(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (v.includes("...")) return false;
  if (/^(your|replace|changeme|todo|xxx)/i.test(v)) return false;
  return v.length >= 20;
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

/**
 * A 401 from a provider is unambiguous — the credential was rejected — but the
 * raw message says nothing about WHICH credential or where it is configured,
 * and it surfaces three minutes into a run rather than at setup. This turns it
 * into something someone can act on without reading the source.
 */
export function authHelp(
  provider: "Anthropic" | "OpenAI",
  mode: RoutingMode,
  status: number
): string {
  if (mode === "gateway") {
    return `${provider} call rejected by the Pexalo gateway (${status}). The provider key is held by HQ, not here — so this is the service token, this workspace's entitlement to ${provider}, or HQ's own provider key. Check PEXALO_SERVICE_TOKEN, then ask HQ.`;
  }

  const envVar =
    provider === "Anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const console_ =
    provider === "Anthropic"
      ? "console.anthropic.com → API keys"
      : "platform.openai.com → API keys";
  // The look-alikes differ per provider, and naming the right ones is the whole
  // value of this message.
  const lookalikes =
    provider === "Anthropic"
      ? "A Console login, an OAuth token or a claude.ai session cookie all look like keys and none of them work here"
      : "A project key from the wrong project, a revoked key, or a session token from the ChatGPT web app all look like keys and none of them work here";

  return [
    `${provider} rejected the API key (${status}). The request reached ${provider} — routing is fine — the credential itself is not accepted.`,
    ``,
    `Check, in this order:`,
    `1. Did you restart the server after editing .env.local? Next.js reads env at boot only, so an edited key does nothing until you stop and restart npm run dev.`,
    `2. Is ${envVar} an API key from ${console_}? ${lookalikes}.`,
    `3. Any stray quotes, spaces or a line break in the value? Write it as ${envVar}=sk-... with no quotes.`,
    `4. Has the key been revoked, or does it belong to an org with no credit?`,
    ``,
    `Run the preflight at /api/health?probe=1 to test both providers directly.`,
  ].join("\n");
}

/**
 * The right explanation for the status that actually came back.
 *
 * 401 and 403 are credential problems. Everything else is NOT — and answering a
 * 400 with "check your API key" sends someone to re-paste a credential that was
 * always fine. A 400 from either provider is a malformed request, and by far the
 * most common cause here is a model name the account cannot reach: a model in
 * limited release, one not enabled on the project, or a typo in an override.
 */
async function failureDetail(
  provider: "Anthropic" | "OpenAI",
  mode: RoutingMode,
  res: Response
): Promise<string> {
  if (res.status === 401 || res.status === 403) {
    return authHelp(provider, mode, res.status);
  }

  let message = "";
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body) as {
        error?: { message?: string; code?: string; type?: string };
      };
      message = j.error?.message ?? body.slice(0, 300);
    } catch {
      message = body.slice(0, 300);
    }
  } catch {
    message = "(no response body)";
  }

  const envVar =
    provider === "Anthropic" ? "STRATEGY_MODEL / WRITER_MODEL" : "REVIEWER_MODEL";
  const fallback = provider === "Anthropic" ? "claude-sonnet-4-5" : "gpt-4.1";

  if (res.status === 400 || res.status === 404) {
    return [
      `${provider} returned ${res.status} — a bad REQUEST, not a bad key. The credential is not the problem here.`,
      ``,
      `${provider} said: ${message}`,
      ``,
      `Most often this is a model the account cannot reach — in limited release, not enabled on the project, or a typo in an override. To fall back, add this to .env.local and restart:`,
      `    ${envVar.split(" / ")[0]}=${fallback}`,
      provider === "OpenAI"
        ? `The reviewer only has to be a different vendor from the writer; ${fallback} satisfies that just as well.`
        : `Check the model id against console.anthropic.com.`,
    ].join("\n");
  }

  if (res.status === 429) {
    return `${provider} returned 429 — rate limited or out of quota. The key is valid. ${message}`;
  }

  return `${provider} returned ${res.status}. ${message}`;
}

export interface ProbeResult {
  provider: "anthropic" | "openai";
  ok: boolean;
  status: number | null;
  detail: string;
}

/**
 * A real but minimal call to each provider, to answer "are these credentials
 * actually good" without running a pipeline.
 *
 * Costs a fraction of a cent and takes a second. Worth it: the alternative is
 * discovering a bad key partway through a twenty-article batch, having paid for
 * everything up to that point.
 */
export async function probeProviders(): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];

  try {
    const route = anthropicRoute({ stage: "probe" });
    const res = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify({
        model: process.env.STRATEGY_MODEL || "claude-sonnet-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    out.push({
      provider: "anthropic",
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? "Key accepted."
        : await failureDetail("Anthropic", route.mode, res),
    });
  } catch (e) {
    out.push({
      provider: "anthropic",
      ok: false,
      status: null,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const route = openaiRoute({ stage: "probe" });
    const res = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify({
        model: process.env.REVIEWER_MODEL || "gpt-5",
        max_completion_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    out.push({
      provider: "openai",
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? "Key accepted."
        : await failureDetail("OpenAI", route.mode, res),
    });
  } catch (e) {
    out.push({
      provider: "openai",
      ok: false,
      status: null,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return out;
}
