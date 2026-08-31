# Pexalo AI gateway — endpoint contract

The spec for the HQ side. This app already speaks it: set `PEXALO_AI_URL` and
`PEXALO_SERVICE_TOKEN` and every model call routes here instead of to the
providers.

## What it is

A thin authenticated pass-through. HQ holds the Anthropic and OpenAI keys; the
client workspaces hold a service token each. HQ forwards the request unchanged,
returns the response unchanged, and records what it cost and who it was for.

## What it is deliberately not

**Not a translation layer.** The request and response bodies are the providers'
own, byte for byte. The moment the gateway reshapes a payload it becomes a place
where direct mode and gateway mode can produce different output from the same
prompt — and that difference will be found in production, on a wire release,
weeks later. Anything HQ needs to know travels in headers.

**Not a cache.** These are research calls with live search; a cached market scan
is a wrong market scan.

**Not a place to enforce editorial rules.** The blocked-claims logic, the
sourcing standard and the review gate live in the workspace, where they can be
per-client. A gateway that also has opinions about content is two systems
disagreeing about one job.

---

## Routes

```
POST {PEXALO_AI_URL}/ai/anthropic/v1/messages
POST {PEXALO_AI_URL}/ai/openai/v1/chat/completions
```

The path after `/ai/{provider}` mirrors the provider's own, so adding a new
provider route is mechanical.

### Request

Headers sent by the workspace:

| Header | Always | Meaning |
|---|---|---|
| `authorization: Bearer <token>` | yes | The workspace's service token |
| `content-type: application/json` | yes | |
| `x-pexalo-client` | when known | Client ref, e.g. `coinpresso` |
| `x-pexalo-run` | when known | Run id, for tracing a spend line to an article |
| `x-pexalo-stage` | when known | `strategy`, `writer`, `reviewer`, `revision`, `ideas` |

Body: the provider's own request body, untouched. For Anthropic that includes
`tools: [{ type: "web_search_20250305", ... }]` on research calls — the gateway
must forward tool definitions rather than stripping them, or research silently
degrades to answering from memory.

### What HQ does

1. Resolve the service token → workspace. Reject unknown or revoked with `401`.
2. Check the workspace is entitled to the provider and the model. Reject with
   `403` and a message naming the model.
3. Apply the workspace's rate limit. On breach return `429` with `retry-after`.
4. Attach the real provider credential and forward.
5. Record the usage line: workspace, client ref, run, stage, model, tokens in
   and out, cost, timestamp.
6. Return the provider's response and status unchanged.

### Response

The provider's response body and status, verbatim. Add only:

| Header | Meaning |
|---|---|
| `x-pexalo-cost-usd` | What HQ recorded for this call |
| `x-pexalo-request-id` | HQ's id, so a workspace error can be traced |

Errors HQ generates itself (401/403/429) use:

```json
{ "error": { "type": "pexalo_gateway", "code": "...", "message": "..." } }
```

The workspace surfaces `message` directly, so write it for the person reading a
failed run — "this workspace is not entitled to claude-opus-5", not "forbidden".

---

## Tokens

- One per workspace, not one per user.
- Revocable individually. Revoking Coinpresso's token must not affect Geo One.
- Scoped to the providers and models that workspace is entitled to. This is what
  makes the model register enforceable rather than advisory: today a workspace
  could set `STRATEGY_MODEL=claude-opus-5` and quintuple its own bill.
- Rotatable without a redeploy — the workspace reads it from the environment, so
  rotation is a variable change and a restart.

---

## Streaming

Not needed. Every call this app makes is a single request/response with the full
result parsed as JSON; nothing renders token by token. If HQ adds streaming
later, the workspace does not have to change.

---

## Timeouts

The research stage runs a dozen searches and can take two to three minutes. The
gateway must allow **at least 300 seconds** on `/ai/anthropic/v1/messages`. A
60-second default proxy timeout will kill exactly the calls that matter most and
present as an intermittent research failure.

---

## Why this is worth building

The workspace already records per-stage tokens and cost, and the costs page
already sums them. That is per-workspace, and it only sees what that workspace
did.

The gateway is the only place that can answer the questions that matter at
Pexalo's level:

- What did all clients cost this month?
- Which client is the most expensive per published article?
- If we move every workspace from Sonnet 4.5 to Sonnet 5, what changes?
- One key leaked — what do we rotate, and what breaks? (One variable, in one
  place, rather than N services.)

None of those are answerable while every workspace holds its own keys.
