# Deploying to Railway, alongside Pexalo HQ

## What this covers

Running the Coinpresso dashboard as a Railway service in the Pexalo project, so
it inherits shared variables and sits behind the same portal login — and the two
ways model credentials can reach it.

---

## 1. The thing that will bite you first

**Railway filesystems are ephemeral.** They are rebuilt on every deploy.

Everything this app has produced lives under `.data/`:

| Path | What is in it |
|---|---|
| `.data/runs` | Every article run, its stages, drafts, reviews and costs |
| `.data/batches` | Batch progress and timings |
| `.data/archive` | The published archive, including imported blog full text |
| `.data/campaign-facts` | Campaign fact sheets — the raised total, stage, token price |
| `.data/settings` | **The Telegram bot token and the WordPress application password** |

On a default Railway deployment, a `git push` wipes all of it. The failure is
silent: the app comes back, the dashboard renders, the queue is just empty.

**The fix, before the first real run:**

1. Railway → the service → **Data** → add a volume, mount path `/data`
2. Set `DATA_DIR=/data`
3. Deploy, then `curl https://<service>/api/health` and confirm
   `storage.ephemeral` is `false`

`/api/health` reports this on every deploy rather than leaving it to a README
nobody reads twice.

This is a step toward Postgres, not a substitute for it. The store interfaces
are deliberately narrow — get, list, save — so moving to a database touches five
files (`store.ts`, `batch.ts`, `archive-store.ts`, `campaign-store.ts`,
`settings.ts`). Do that before this carries more than one client.

**Keep `numReplicas` at 1.** The batch worker pool and the JSON stores both
assume a single process. Two replicas would double-run batches and race each
other on the same files.

---

## 2. Model credentials — two modes

The provider modules ask `src/lib/providers/routing.ts` for a URL and headers.
It answers one of two ways, and the request body is identical either way.

### Direct (today)

Straight to `api.anthropic.com` and `api.openai.com`, using keys from the
environment. On Railway put them in **project-level shared variables** so every
Pexalo service reads one set rather than each carrying its own copy:

```
ANTHROPIC_API_KEY   shared, project level
OPENAI_API_KEY      shared, project level
```

Then reference them on the service. Nothing else is needed — this is the default.

### Gateway (the end state)

This app holds **no provider credential at all**. It authenticates as itself and
Pexalo HQ forwards the call:

```
PEXALO_AI_URL          https://api.pexalo.com
PEXALO_SERVICE_TOKEN   the service token HQ issues to this workspace
```

Set **both** or **neither**. A URL without a token would fail every call with a
401 that looks like a provider problem; the routing layer refuses that
combination, stays in direct mode, and says so in `/api/health`.

### Why bother with the seam

Shared variables are right today and wrong at ten clients: every service holding
the keys means ten places to rotate, ten places a leak can come from, and no
single view of spend across the estate. The gateway fixes all three. Building
the seam now makes that switch an environment change rather than a rewrite of
every call site, and the seam is one file.

---

## 3. Environment variables

| Variable | Needed | Notes |
|---|---|---|
| `DATA_DIR` | **Yes on Railway** | Volume mount path, e.g. `/data` |
| `PORTAL_PASSCODE` | **Yes in production** | Coinpresso team login |
| `PORTAL_ADMIN_PASSCODE` | **Yes in production** | Pexalo login — billing figure, snapshot restore |
| `BILLING_MARKUP_PCT` | No | Default 10; shown to the admin login only |
| `BILLING_HOSTING_USD` | No | Flat monthly hosting allowance on the admin billing card; 0 = included in retainer |
| `ANTHROPIC_API_KEY` | Direct mode | Shared, project level |
| `OPENAI_API_KEY` | Direct mode | Shared, project level |
| `PEXALO_AI_URL` | Gateway mode | Both or neither |
| `PEXALO_SERVICE_TOKEN` | Gateway mode | Both or neither |
| `STRATEGY_MODEL` | No | Overrides the register default |
| `WRITER_MODEL` | No | Overrides the register default |
| `REVIEWER_MODEL` | No | Must stay a different family from the writer |
| `MOCK_AGENTS` | No | `1` forces mock even with credentials |
| `GOOGLE_SERVICE_ACCOUNT_B64` | No | Doc export on approval |
| `CONTENT_CALENDAR_SHEET_ID` | No | Calendar write-back |
| `PORT` | Set by Railway | `npm start` binds it |

Do not commit any of these. The app never returns a stored credential to the
browser — settings mask them on read — and the same discipline applies here.

---

## 4. Deploy

`railway.json` carries the build and deploy config:

- Builder: Nixpacks. Install is Nixpacks' own `npm ci`; the build command is
  just `npm run build`. Do NOT put `npm ci` in the build command — Railway mounts
  a cache at `node_modules/.cache` during the build step, and a second `npm ci`
  fails trying to remove it (`EBUSY … rmdir '/app/node_modules/.cache'`).
- Start: `npm run start` — binds `0.0.0.0` and `$PORT`
- Healthcheck: `/api/health`, 120s timeout (the first boot compiles)
- Restart on failure, 3 retries, 1 replica

Node version is pinned in `.nvmrc`.

**After every deploy:**

```
curl https://<service>.up.railway.app/api/health
```

Check three fields:

- `mode` — `live`, not `mock`
- `routing` — `direct` or `gateway`, whichever you configured
- `storage.ephemeral` — must be `false`
- `warnings` — must be empty

---

## 5. The login

The service now carries its own gate — `src/proxy.ts` — so it can take a public
domain before HQ fronts it. Two shared passcodes, two roles:

| Variable | Who | Sees |
|---|---|---|
| `PORTAL_PASSCODE` | Coinpresso's team (Elena, Liam) | The whole dashboard: plan, approve, publish, cost base |
| `PORTAL_ADMIN_PASSCODE` | Pexalo | The same, plus **Billable to Coinpresso** on the costs page (cost × `BILLING_MARKUP_PCT`, default 10) and the **data snapshot restore** in Settings |

Both are **required in production**. With neither set, every page and API route
returns 503 with a message saying so — the app refuses to run open. `/api/health`
reports `portal: "configured" | "MISSING"` and stays reachable without a cookie
so Railway's healthcheck works.

Sessions are a signed cookie, thirty days. Rotating a passcode logs everyone
who used it out. Sign in at `/login`; there is no sign-out UI yet — clear the
cookie or wait.

**Later**, HQ's portal (`POST api.pexalo.com/api/portal/login` → `/client/{ref}`)
replaces this: the seam is `src/lib/portal-auth.ts` + `portal-session.ts`, and
the rest of the app only ever asks "what role is this request".

## 6. Moving the data across

A fresh volume is empty. The working installation on a laptop holds the imported
topics, the coinpresso.io archive, the settings and the finished posts.

1. On the machine that has the data: `node scripts/export-data.mjs` →
   `coinpresso-data-YYYYMMDD.snapshot.gz`
2. On the deployed app, sign in with the **admin** passcode → Settings →
   **Data on this installation** → choose the file → Restore.
3. Delete the snapshot file. It contains the WordPress application password.

The restore refuses if the target already holds runs unless you tick
"overwrite", and ignores any path in the file that would land outside `DATA_DIR`.
