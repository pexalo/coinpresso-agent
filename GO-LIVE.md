# Going live with the agents

Eight phases from a dead API key to a verified live article. The order matters:
each phase ends with something you check before spending money on the next one.
About twenty minutes, and about forty cents.

| | |
|---|---|
| Strategy · writer · revision | `claude-sonnet-5` |
| Reviewer | `gpt-5` |
| Per wire article | $0.32 → $0.42 from 1 Sep |
| Per blog post | $0.27 → $0.35 from 1 Sep |
| 4 wire + 6 blog daily | $86 → ~$114/month from 1 Sep |

Sonnet 5's $2/$10 was a launch rate through 31 Aug; it steps to $3/$15 after.
The register carries the change and the forecast already prices a month ahead.

---

## 1. Get the keys

Two keys, one set for **all of Pexalo** — not one per client.

### Anthropic — required, new

The key in `~/.zshrc` is dead. Anthropic returned `401 API key is invalid` to a
direct request outside the app, so it is revoked or its org was removed.

1. https://console.anthropic.com/settings/keys → **Create Key**
2. Copy it — starts `sk-ant-api03-`
3. Check the org has credit: https://console.anthropic.com/settings/billing

**Don't skip the billing check.** A key on a zero-balance org fails in ways that
look exactly like a bad key.

### OpenAI — you may already have a working one

Drives the reviewer, deliberately a different vendor from the writer. The setup
script tests yours. If it fails: https://platform.openai.com/api-keys

---

## 2. Load them into the app

```
cd ~/Pexalo/coinpresso-agent
./SETUP-KEYS.sh
```

Prompts for each key with input hidden, then:

- Sends a real one-token request to each provider
- Writes `.env.local` **only if both work**
- Comments out the exports in `~/.zshrc`, backing the file up first

**Why it edits `.zshrc`:** Next.js resolves env vars in a fixed order and stops
at the first hit — `process.env` comes **before** `.env.local`. A key exported in
your shell silently overrides the file, so edits to `.env.local` do nothing.
That is what made the last 401 look unfixable.

```
unset ANTHROPIC_API_KEY OPENAI_API_KEY
npm run dev
```

`unset` clears the current window; the `.zshrc` edit handles every new one.

---

## 3. Verify before you spend

Open http://localhost:3000/api/health?probe=1 — or **Test now** on Resources.
One real call per provider; a fraction of a cent.

| Field | Want | If wrong |
|---|---|---|
| `mode` | `live` | `mock` = no usable credentials, nothing produced is real |
| `routing` | `direct` | `gateway` only once HQ proxies model calls |
| `models` | sonnet-5 / gpt-5 | An override is set in `.env.local` |
| `credentials` | `from the env file` | `shell is overriding the file` = phase 2 didn't take |
| `warnings` | `[]` | Read them — each names its own fix |

**Gate: do not continue until `warnings` is empty.** Everything after this costs
money, and a run that fails at the reviewer has already paid for research and
drafting.

---

## 4. Run one article — not a batch

**Crypto PR → New article.** Title, one or two keywords, a wire.

First check **Crypto PR → Campaigns** — the Moonberg fact sheet holds the raised
total, stage and token price, and every brief is stamped with whatever is there
at submission. A stale fact sheet puts last week's number on a newswire.

**One, not twenty.** The first run is for seeing where the gates are. A batch of
twenty on an unverified setup is twenty ways to pay for the same mistake.

Expect ~3 minutes, ~$0.32.

---

## 5. Read the run in the right order

Read the draft **last**, once you know what the machine already caught.

1. **Link check** — unsourced or unreachable is a hard problem. Unsourced means
   the writer produced a URL the research never retrieved.
2. **Review findings** — blockers first: invented figure, guaranteed return,
   missing disclaimer. Majors read as off-brand. Minors are polish.
3. **Source ledger** — every citation allowed, with the figures each source
   actually states. A number not in here came from nowhere.
4. **The draft** — now read it as the reader would.

Good looks like: sources resolve, no blockers, figures match the ledger. A
reviewer sending it back once and the second pass fixing it is the system
working.

---

## 6. Try the ideation scan

**Crypto PR → Ideas.** Runs the strategy agent with live web search: scans the
market, proposes **topics** (real dated catalysts with URLs) and the titles worth
running on each. A minute or two, roughly one article's cost.

- Every topic should have a source link. **No source found** is the one to distrust.
- A **thin** catalyst with three clever titles is three weak articles — deselect
  the topic.
- Selecting titles carries the catalyst into the brief, so research starts from
  the hook the title was chosen for.

---

## 7. Give it the house voice

**Coinpresso Blog → Integration → Import from coinpresso.io.**

Until this runs, the blog writer works from a written *description* of the voice
— which gets a post that obeys the description rather than one that sounds like
Coinpresso. Re-running updates rather than duplicates, so it is safe weekly.

The posts are examples of **how** they write, not a list of banned topics.

**The wire side still has this gap.** The Moonberg archive holds 62 titles but no
article text, so the wire writer's exemplar block is empty. Liam's content
calendar has live URLs for ~64 published releases — that backfill is the
highest-value thing still outstanding.

---

## 8. Scale up

| Step | Where | Time | Cost |
|---|---|---|---|
| Batch of 5 | Ideas → select 5 → Generate | ~7 min | ~$1.60 |
| A blog day | Blog → Plan the day → 6 posts | ~9 min | ~$1.60 |
| Batch of 20 | Ideas → select 20 → Generate | ~25 min | ~$6.40 |

Three run at once by design — twenty in parallel would hit rate limits and return
a wall of failures. The progress estimate comes from the batch's own completed
runs, so it starts rough and converges.

---

## What it costs

**API costs** shows the cost base — spend split into tokens and search, a line
per run, per-stage and per-model rollups, and a cadence forecast.

Web search is **$10 per 1,000 searches on top of tokens**, and a research call
makes up to a dozen. Measured from the API's own usage block, not estimated —
roughly a quarter of a run, so any figure that leaves this page has to include it.

**Invoicing is not in this dashboard.** It belongs in Pexalo HQ alongside the
contract — a markup panel here would be the agency showing a client its margin on
them, with a field to edit the rate. The formulas and the two things about them
that are easy to get wrong are in `PEXALO-HQ-BILLING.md`.

---

## What stays guarded

- **Nothing publishes.** Wire releases land in the queue. Blog posts are created
  in WordPress as drafts — no publish path in the code, no setting that adds one.
- **The writer cannot invent a source.** Only ledger URLs; a missing fact is
  written around, not filled in.
- **Citations are checked by code**, not by a model.
- **Two vendors, on purpose.** Moving the reviewer to a Claude model would remove
  the gate while leaving it looking identical.
- **Revision bounded at two passes**, then it lands in review with findings
  attached rather than marked passed.

---

## Troubleshooting

| Symptom | Usually this |
|---|---|
| 401 from Anthropic | `./FIX-API-KEY.sh` — tests the key outside the app, separating a dead key from a config problem |
| 400, a parameter is "deprecated for this model" | A re-tiered model that no longer takes it. `temperature` is dropped for models the register marks as rejecting it, and a 400 naming it is retried once without it — so this self-corrects. If it persists, check the model id on Resources → Models |
| Everything says "mock" | No usable key. `/api/health` names which, and whether a shell export shadows the file |
| `.env.local` edits do nothing | A shell export is winning. `unset` it, comment it out of `~/.zshrc` |
| Reviewer rejects everything | Usually a blank campaign fact sheet — every figure unverified, therefore a blocker |
| Drafts sound generic | Exemplar block is empty. Import the blog; paste article bodies into the wire archive |
| Ideas repeat last week | The archive is what it reads. Runs made outside this system aren't in it |
| Forecast looks wrong | Check modelled vs measured. Under five real runs it is arithmetic, not history |

---

Prices verified 24 August 2026. Re-check quarterly — the register carries the
date, and a stale date is more useful than a confident wrong number.
