# Coinpresso Agent

Research, draft and review crypto PR to Coinpresso's house style. Liam supplies a
title, the target keywords and the wire; three agents do the rest and hand back a
wire-ready draft with every citation traced.

Built on the Geo One stack — Next.js 16 App Router, React 19, Tailwind 4,
TypeScript — so it drops into Pexalo HQ without a framework argument.

---

## Running it

```bash
npm install
cp .env.example .env.local     # add your keys
npm run dev                    # http://localhost:3000
```

**Without keys it still runs.** The pipeline executes end to end with canned agent
responses, so the dashboard, the review loop and the export path are all
explorable before anything is spent. A `MOCK MODE` badge sits in the header and
every mock run is labelled on its own page.

Add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to `.env.local` and it switches to
live automatically. Nothing else changes.

---

## What happens when Liam presses the button

```
Brief -> Strategy -> Writer -> Link check -> Reviewer -> Revision -> Liam
                                    ^                        |
                                    +------------------------+
                                        bounded at 2 passes
```

**Strategy** (Claude + web search) finds a real, dated news catalyst and at least
two independent third-party price forecasts, deliberately spread between bullish
and cautious. It returns a structured brief and, critically, a **source ledger** —
the exact URLs it retrieved, with the figures each one states.

**Writer** (mid-tier Claude) drafts to the framework and the wire's format rules.
It is barred from introducing any URL, publisher, analyst or figure that is not in
the ledger. Given a complete brief the writing task is constrained enough that a
frontier model buys very little.

**Link check** is not a model. It extracts every URL from the draft, compares each
against the ledger ignoring tracking parameters, and requests it. Anything
unsourced or unreachable becomes a blocker.

**Reviewer** (GPT — a different family from the writer, on purpose) holds the house
style profile. It scores style, sourcing, structure, SEO and compliance, checks the
primary keyword in each required position, checks the pacing rule and the presence
of a cautious counter-forecast, and returns graded findings each with a concrete
fix.

**Revision** sends the findings back to the writer, which changes only what they
require. Bounded at two passes — after that the run lands in review with its
outstanding findings attached and a human decides.

---

## The pages

Routes are client-scoped, because every Pexalo client owns a workspace and what
is inside it comes from the modules on their record.

| Route | What it is |
|---|---|
| `/` | Pexalo HQ — the client list. |
| `/client/[ref]` | A client's workspace. Module cards, campaigns. |
| `/client/[ref]/crypto-pr` | The queue. Every run, its stage, its verdict, its cost. |
| `/client/[ref]/crypto-pr/new` | The brief. Title, keywords, wire — plus optional presale figures. |
| `/client/[ref]/crypto-pr/runs/[id]` | The workflow view. Draft, review findings, per-stage inputs and outputs, source ledger. |
| `/client/[ref]/crypto-pr/agents` | What each agent does and why it exists. Plus the per-wire format table. |
| `/client/[ref]/crypto-pr/style` | The extracted house style profile and the framework sent to the writer. |

Try `/client/coinpresso` and `/client/geo-one` side by side — same shell, no
shared screens. Geo One's modules are declared but not built here; they exist to
show that the navigation comes from the client record rather than a constant.

APIs mirror it: `/api/clients/[ref]/runs`. Every request is gated twice — the
client must exist, and it must have the module enabled — and a run id from
another client reads as not found rather than leaking across tenants.

---

## Where the important things live

| File | What it holds |
|---|---|
| `src/lib/clients.ts` | The client registry and the module system. **Add a client here.** |
| `src/lib/style-profile.ts` | Liam's style profile and the framework. **Edit this to change the voice.** |
| `src/lib/publications.ts` | Per-wire rules: link style, length, FAQ count, dateline, boilerplate. |
| `src/lib/agents/strategy.ts` | Research prompt and output schema. |
| `src/lib/agents/writer.ts` | Draft prompt, style injection, revision handling. |
| `src/lib/agents/reviewer.ts` | Review rubric and severity thresholds. |
| `src/lib/agents/linkcheck.ts` | Deterministic citation verification. |
| `src/lib/pipeline.ts` | Orchestration and the revision bound. |
| `src/lib/models.ts` | Model tiering and cost estimates. |

The style profile matches the schema in Pexalo HQ's
`FEATURE-SPEC-writing-style.md`, so it ports into the Client Profile → Writing
Style tab without a translation layer.

---

## Google export

Optional. On approval, if `GOOGLE_SERVICE_ACCOUNT_B64` is set, the app creates a
Google Doc with the article and appends a row to the Moonberg content calendar
matching Liam's existing column order, with status `Edited - Waiting to publish`.

Without it, approval still succeeds and the draft stays exportable from the
dashboard in four formats — rendered, HTML, plain text and markdown.

The service account needs Docs, Sheets and Drive scope, and the calendar sheet
must be shared with its email address.

---

## Storage

Runs are JSON files under `.data/runs/`. That is a prototype decision — in Pexalo
HQ this becomes a `runs` table. The interface in `src/lib/store.ts` is deliberately
three functions wide so swapping it touches one file.
