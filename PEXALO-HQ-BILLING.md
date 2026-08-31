# Re-billing model spend — an HQ concern

This app does **not** implement re-billing, and should not. It ran a markup
calculation and a Settings panel for it until this was written; both are gone.

## Why it moved

The dashboard this repo builds is **Coinpresso's**. Elena, Kat and Liam work in
it every day. The markup is Pexalo's margin on Coinpresso — so a "Billed to
Coinpresso: $94.60, of which markup $8.60" panel was showing the client the
agency's margin on themselves, in their own tool, and letting them edit the
rate.

The place that owns this is **Pexalo HQ**, where Coinpresso is one client among
several. Same reason the campaign picker belongs to Crypto PR and not the global
header: a control belongs where the thing it governs lives.

## What this app still owns

The **cost base** — what the providers actually charged, measured rather than
estimated. `buildReport()` in `src/lib/costs.ts` produces it, and the API costs
page shows it: per run, per stage, per model, tokens and search separated.

That is the honest division. This app knows what the work cost because it made
the calls. HQ knows what the client pays because it holds the contract.

**A note on what remains visible.** The cost base is still on Coinpresso's own
API costs page, and anyone who knows the markup percent can derive the invoice
from it. That is deliberate — they are entitled to see what their programme
costs to run, and hiding it would make the page a stub. If the markup should not
be derivable, the fix is to remove the dollar figures from that page entirely
and leave usage volume, not to leave a half-hidden number that looks like
concealment.

## The model HQ should implement

Preserved here because it was worked out carefully and two parts of it are easy
to get wrong.

### Cost base

```
runCost      = tokenCost + searchCost

tokenCost    = Σ over stages of
                 (tokensIn  / 1e6 × model.pricing.in) +
                 (tokensOut / 1e6 × model.pricing.out)

searchCost   = searchRequests × $0.01        # $10 per 1,000
```

`searchRequests` is read from the API's own usage block
(`usage.server_tool_use.web_search_requests`), never estimated from the number
of URLs a call returned — one search returns many URLs.

Prices come from `src/lib/model-registry.ts`, which carries a `PRICED_ON` date.
HQ should read them from there or from its own dated register, never from a
second hand-maintained table. This repo had two, they drifted, and Opus 4.5 sat
at three times its real price for weeks.

### Charge

```
markup       = costBase × markupPercent / 100
subtotal     = costBase + markup
charged      = max(subtotal, monthlyMinimum)
```

### Two things that are easy to get wrong

**1. Search is part of the cost base.** The provider bills it separately from
tokens and it is roughly a quarter of a run. A markup applied to a tokens-only
figure charges less than the work cost — the margin is negative before it
starts.

**2. The base is small.** At 4 wire + 6 blog a day the whole model bill is about
$86/month, so ten percent is about $8.60. That is a pass-through, not a revenue
line. Defending it on an invoice costs more goodwill than it earns; "model costs
included" is usually the easier sell. The money in this service is the retainer.

### Excluded from billing

Mock runs. They cost nothing, finish in nine seconds, and counting them puts the
per-article average near zero and the monthly forecast out by two orders of
magnitude. `buildReport()` already excludes them from every figure and average,
and flags how many were dropped.

## How HQ gets the data

Two routes, and the second is the one to build:

1. **Today** — `buildReport(await listRuns(ref))` inside this app, exposed on a
   read endpoint HQ polls.
2. **Once the gateway is live** — HQ is already in the call path and records
   cost per request with the client, run and stage attribution headers described
   in `PEXALO-AI-GATEWAY-SPEC.md`. At that point HQ has the cost base
   first-hand and does not need to ask this app for it at all, which is the
   right end state: one place that knows what everything cost, across every
   client.
