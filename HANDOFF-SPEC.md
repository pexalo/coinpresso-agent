# Handoff: folding the Coinpresso agent into Pexalo HQ

Written for whoever integrates this. The prototype is a working standalone app;
this is what changes when it becomes a client module inside HQ, and which
decisions in it were load-bearing rather than convenient.

Same house as `FEATURE-SPEC-writing-style.md` and `FEATURE-SPEC-batch-publishing.md`.

---

## What this is

Coinpresso runs a high-volume crypto PR programme for Moonberg — 60+ wire releases
across nine outlets in the first three weeks of August alone, all written by one
person against a consistent editorial formula. The formula is documented and
stable. That combination is what makes it automatable, and what makes the failure
modes predictable enough to build guardrails around.

The client-facing promise is not "AI writes the PR". It is: Liam supplies a title,
the keywords and the wire, and gets back a draft that matches what he already
publishes, with every price target attributed to a real source he can click.

---

## Where it sits in HQ

Coinpresso is a **Pexalo client** — a peer of Geo One, not a Geo One client.
Moonberg is a campaign under it. The prototype is already built in this shape:

```
Pexalo HQ
  /client/coinpresso            modules: [crypto-pr]
      /crypto-pr                queue · new · agents · house style
      campaigns: [moonberg]

  /client/geo-one               modules: [visibility, content-feed, citations, authority]
      /visibility  /content-feed  /citations  /authority
```

**The workspace is composed, not templated.** `src/lib/clients.ts` holds a client
registry and a module registry; the navigation, the routes and the API
entitlements all derive from the modules on a client's record. In HQ this becomes
a `clients` table plus a `client_modules` join.

This is the one structural change to HQ that this work implies, and it is worth
doing before the third client rather than after. The tempting shape is a single
dashboard with fixed tabs and different data behind them — Coinpresso is the proof
it does not hold. There is no site to publish to, no visibility score and no
citations to match, because the output goes to third-party newswires. It needs a
production queue and Geo One does not. Compose per client and no future client has
to be shaped like the first one.

**Tenancy is enforced, not implied.** Every API request is gated twice: the client
must exist, and it must have the module enabled — `/api/clients/geo-one/runs`
returns 404 even though the route exists. Run lookups assert ownership, so a run
id belonging to another client reads as not found. Keep both when the auth layer
goes in: a session token scoped to a client is necessary but not sufficient, since
a valid Coinpresso token must still not read a Geo One run.

**Campaigns nest under the client.** Coinpresso is an agency, so a second token
project adds a campaign rather than a second account, and reuses the style profile
store, model budget and approval history. `Run.campaignId` already carries it.

It reuses three things HQ already has:

| HQ feature | How this uses it |
|---|---|
| Client Profile -> Writing Style | `src/lib/style-profile.ts` already matches that schema. Move it into the client record and delete the local constant. |
| Approval queue | `status: needs_review` is the same state. Reuse the review screen and the `approvedBy` capture. |
| Content feed / publishing | Not used here — these go to third-party wires, not to a client site. The Doc + calendar write-back replaces it. |

It does **not** reuse the Blog agent. The framework is materially different: this
is parasitic-SEO wire copy where the commercial subject arrives late and every
forecast must be third-party attributed. Forcing it through the general Blog agent
prompt would lose the thing that makes the output pass as Liam's.

---

## Integration checklist

**1. Clients and modules.** Replace `src/lib/clients.ts` with the HQ `clients`
table plus a `client_modules` join. Keep `getClient` / `clientModules` /
`hasModule` as the accessors — the header, the route guards and the API gates all
go through those three functions, so nothing else changes.

**2. Storage.** Replace `src/lib/store.ts` with the HQ persistence layer. The
interface is `getRun`, `listRuns`, `saveRun` — three functions, one file.
`listRuns` already takes a `clientRef` and `getRun` already asserts ownership;
those become a `WHERE` clause and should stay mandatory rather than optional.

**3. Auth.** The prototype has none. Liam gets a portal login scoped to Coinpresso
— the same `POST /api/portal/login` flow the Geo One site already uses, landing on
`/client/coinpresso` instead of a Geo One workspace. The `approvedBy` field
currently hardcodes `"Liam"` in the approve call — wire it to the session user.
That field is the record of who took editorial responsibility, and it is what you
produce if anyone disputes a sign-off.

**4. Model keys.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are read from env in
`src/lib/providers/*`. Move to HQ's secret store. Keep the two provider modules as
the only integration surface.

**5. Long-running work.** The prototype fires the pipeline and lets the browser
poll. A live run takes two to five minutes, most of it in the strategy agent's
search. In HQ this belongs on the existing job queue, not on a request. The
`executeRun` function already writes each stage to storage as it completes, so a
worker needs no restructuring — just call it from the queue instead of the route.

**6. Cost accounting.** `estimateCost` in `src/lib/models.ts` carries per-model
rates. Point it at whatever HQ already uses, and attribute spend to the client.

**7. Rate limiting.** Nothing stops Liam queueing forty runs at once. HQ should cap
concurrent runs per client — the strategy agent's search usage is the expensive
part, and forty simultaneous searches is both a bill and a rate-limit incident.

---

## Decisions taken, and why

**The reviewer is a different model family from the writer.** A reviewer sharing
the writer's lineage shares its blind spots and largely agrees with itself, which
produces a review stage that costs latency and catches nothing. If the models are
ever consolidated to one provider, this stage loses most of its value — keep the
split.

**Link verification is code, not a model.** A model asked "did you invent this
URL?" will sometimes say no. String comparison against the research ledger, plus an
actual HTTP request, cannot be talked round. This is the single highest-value
guardrail in the pipeline: a fabricated citation looks exactly like a real one
until someone clicks it, and it would appear on a newswire under the client's name.

**The writer cannot introduce sources.** Everything citable comes from the strategy
agent's ledger. This is why the research stage runs on the better model and gets
the larger token budget — a thin brief produces a well-written article about
nothing, and the writer has no way to compensate.

**The revision loop is bounded at two.** Two models disagreeing on taste will argue
until the budget is gone. When the bound is hit the run lands in `needs_review`
with its outstanding findings attached rather than being marked passed. That is the
honest outcome, and it is visible in the dashboard.

**Mock mode is not a stub, it is the whole pipeline.** Same orchestration, same
storage, same review loop, canned agent responses. It means the dashboard can be
demonstrated to Liam before a key exists, and it means a provider outage degrades
to something inspectable rather than a stack trace.

**The presale figure is an input, not a lookup.** Published pieces have carried
$200,000, $290,000, $300,000 and $375,000 within one week. The agent cannot resolve
which is current, so it either takes the operator's figure or marks it unverified
and the writer is barred from stating one. Do not "improve" this by scraping a
number — the ambiguity is real and belongs with the human.

---

## What is deliberately not built

**Batch generation.** `FEATURE-SPEC-batch-publishing.md` already specifies this
properly, including the point that batching without approval-friction work makes
the bottleneck worse. The natural next step is a bulk import of calendar rows
marked `Copy Needed`, but it should ship against that spec rather than being
improvised here.

**Auto-publish to wires.** Every outlet in the calendar has a different submission
path, several are paid placements, and a mis-submitted release cannot be recalled.
The Doc plus the calendar row is the right handoff — a human still presses send.

**Style re-extraction UI.** The profile was extracted once from the published
corpus. `FEATURE-SPEC-writing-style.md` specifies the upload-and-extract flow; when
that ships in HQ, point this client at it and drop the constant.

---

## Known gaps worth raising with the client

**The presale figure inconsistency is a real editorial problem**, not just an
input-validation one. Four different totals appeared across one week's releases.
Whatever the pipeline does, someone should decide what the canonical number is
each morning.

**Tracking parameters have leaked into published links** (`?utm_source=chatgpt.com`
appears in the TechBullion piece). The link checker strips them for comparison and
the writer is instructed not to emit them, but the existing published archive still
carries them.

**The corporate contact block in the archive contains a corrupted markdown link** —
an object-replacement character producing `https://moonberg.com/￼Email`. The
version in `src/lib/publications.ts` is clean.

**Volume.** `CONTENT-QUALITY-GUARDRAILS.md` is written for client-site content
rather than paid wire placements, so it does not map cleanly here. But the
underlying point does: sixty near-identical releases in three weeks is a
recognisable pattern, and the defence is genuine structural variety across the set,
not per-article polish. The reviewer currently judges one article in isolation. If
this runs at volume, give it the previous two weeks' headlines and structures and
let it flag repetition — that is a small change to the reviewer prompt and the
highest-value thing to add next.
