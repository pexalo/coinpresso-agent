#!/bin/bash
# ---------------------------------------------------------------------------
# Go / no-go before showing this to anyone.
#
# Run it in YOUR OWN terminal on the Mac, from the repo root, with the app
# already running (npm run dev). It prints nothing secret — lengths and last
# four characters only.
#
# WHY THIS HAS TO RUN ON YOUR MACHINE. The sandbox this project is edited from
# cannot test the API keys: its network proxy rejects any request carrying an
# API key header before that request reaches Anthropic, so it returns 401 for a
# good key and a bad one alike. Proven, not assumed — a request with NO key
# reaches Anthropic and comes back with a proper JSON error and a request_id,
# while the same request WITH a key comes back as bare "Unauthorized" with no
# request_id at all. A 401 from there is evidence about the proxy, not about
# your key.
#
#   ./PREFLIGHT.sh              env + health only, costs nothing
#   ./PREFLIGHT.sh --smoke      also runs one live suggestion (~$0.02)
# ---------------------------------------------------------------------------

set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
CLIENT="${CLIENT:-coinpresso}"
SMOKE=0
[ "${1:-}" = "--smoke" ] && SMOKE=1

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
FAIL=0
ok()   { echo "  ${GRN}ok${OFF}    $1"; }
warn() { echo "  ${YEL}warn${OFF}  $1"; }
bad()  { echo "  ${RED}STOP${OFF}  $1"; FAIL=1; }

echo
echo "PRE-FLIGHT — $(date '+%a %d %b, %H:%M')"
echo "$DIM$BASE · client $CLIENT$OFF"

# --- 1. the key file -------------------------------------------------------
echo
echo "1. Keys on disk"
if [ ! -f .env.local ]; then
  bad ".env.local is missing — run ./SETUP-KEYS.sh"
else
  while IFS='=' read -r k v; do
    [ -z "${k:-}" ] && continue
    case "$k" in \#*) continue;; esac
    n=${#v}
    case "$v" in
      *[\"\'\ ]*) bad "$k has quotes or spaces around it — strip them, they become part of the key";;
      *) ok "$k  len=$n  ends=${v: -4}";;
    esac
  done < .env.local
fi

# --- 2. the shell, which BEATS the file ------------------------------------
# Next.js resolves process.env before .env.local and stops at the first hit, so
# a stale export in ~/.zshrc silently wins and edits to the file do nothing.
# This is the failure that looks exactly like a dead key.
echo
echo "2. Shell overrides"
shadow=0
for v in ANTHROPIC_API_KEY OPENAI_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL; do
  val="${!v:-}"
  if [ -n "$val" ]; then
    bad "$v is exported in this shell (len=${#val}, ends=${val: -4}) — it OVERRIDES .env.local"
    shadow=1
  fi
done
[ $shadow -eq 0 ] && ok "nothing exported — the file wins, which is what you want"
if [ $shadow -eq 1 ]; then
  echo "        ${DIM}fix: unset ANTHROPIC_API_KEY OPENAI_API_KEY${OFF}"
  grep -nE 'ANTHROPIC|OPENAI' ~/.zshrc ~/.zprofile ~/.bash_profile 2>/dev/null \
    | sed -E 's/(=.{0,6}).*/\1.../' | sed 's/^/        /'
fi

# --- 3. is it even up ------------------------------------------------------
echo
echo "3. The app"
H=$(curl -s -m 90 "$BASE/api/health?probe=1" 2>/dev/null)
if [ -z "$H" ]; then
  bad "nothing answered at $BASE — start it with: npm run dev"
  echo
  echo "${RED}NO-GO${OFF} — the app is not running."
  exit 1
fi
ok "answering"

# --- 4. what health says ---------------------------------------------------
echo
echo "4. Live credentials"
echo "$H" | node -e '
let raw = ""; process.stdin.on("data", d => raw += d).on("end", () => {
  let h; try { h = JSON.parse(raw); } catch { console.log("  STOP  health returned something that is not JSON"); process.exit(3); }
  const line = (s, t) => console.log(`  ${s}  ${t}`);
  let bad = 0;

  if (h.mode === "live") line("ok  ", "mode: live — real calls, real output");
  else { line("STOP", `mode: ${h.mode} — EVERYTHING PRODUCED WILL BE FAKE`); bad = 1; }

  if (h.credentials) {
    if (/shell/i.test(h.credentials)) { line("STOP", `credentials: ${h.credentials}`); bad = 1; }
    else line("ok  ", `credentials: ${h.credentials}`);
  }

  if (h.models) {
    const m = h.models;
    line("ok  ", `models: strategy ${m.strategy} · writer ${m.writer} · reviewer ${m.reviewer}`);
    // The reviewer is the whole point of the second opinion. A Claude reviewer
    // reads identically on screen and removes the gate.
    if (/claude/i.test(m.reviewer || "")) { line("STOP", "the reviewer is a Claude model — same family as the writer, so the cross-check is not a cross-check"); bad = 1; }
  }

  (h.probe || []).forEach(p => {
    if (p.ok) line("ok  ", `${p.provider}: ${p.detail}`);
    else { line("STOP", `${p.provider}: ${p.detail}`); bad = 1; }
  });

  const w = h.warnings || [];
  if (!w.length) line("ok  ", "no warnings");
  else w.forEach(x => line("warn", x));

  process.exit(bad ? 3 : 0);
}); '
[ $? -eq 3 ] && FAIL=1

# --- 5. what the demo will look like ---------------------------------------
echo
echo "5. Demo readiness"
S=$(curl -s -m 20 "$BASE/api/clients/$CLIENT/blog-seeds" 2>/dev/null)
echo "$S" | node -e '
let raw = ""; process.stdin.on("data", d => raw += d).on("end", () => {
  let s; try { s = JSON.parse(raw); } catch { console.log("  warn  could not read the topic queue"); return; }
  const t = s.topics || [];
  const q = t.filter(x => x.status === "queued");
  const b = q.filter(x => x.brief && x.brief.angle);
  console.log(`  ok    ${q.length} topics queued, ${b.length} with a full content brief`);
  if (!q.length) console.log("  warn  nothing queued — there is nothing to plan a day from");
}); '

# The voice is the difference between a post that obeys a description of
# Coinpresso and one that sounds like them. It needs no credentials.
# Read the store on disk rather than guessing an API shape — this script runs
# in the repo root, so the file either exists or it does not.
if [ -s ".data/archive/coinpresso-blog.json" ] && grep -q '"title"' .data/archive/coinpresso-blog.json 2>/dev/null; then
  ok "blog archive imported — the writer has real examples of the house voice"
else
  warn "no posts imported from coinpresso.io — drafts will read generic"
  echo "        ${DIM}fix (free, no credentials, ~1 min): Coinpresso Blog → Integration → Import${OFF}"
fi

if grep -q '"appPassword": *"[^"]\+"' ".data/settings/$CLIENT.json" 2>/dev/null; then
  ok "WordPress connected — an approved post can be pushed as a draft"
else
  warn "WordPress not connected — you can show everything up to approval, but not the push"
  echo "        ${DIM}fix: Settings → WordPress → application password${OFF}"
fi

# --- 6. optional live smoke ------------------------------------------------
if [ $SMOKE -eq 1 ] && [ $FAIL -eq 0 ]; then
  echo
  echo "6. Live smoke test  ${DIM}(~\$0.02, exercises the newest code path)${OFF}"
  R=$(curl -s -m 120 -X POST "$BASE/api/clients/$CLIENT/blog-seeds/suggest" \
        -H 'content-type: application/json' -d '{"count":4}' 2>/dev/null)
  echo "$R" | node -e '
  let raw = ""; process.stdin.on("data", d => raw += d).on("end", () => {
    let r; try { r = JSON.parse(raw); } catch { console.log("  STOP  the suggest route did not return JSON"); process.exit(3); }
    if (r.error) { console.log(`  STOP  ${r.error}`); process.exit(3); }
    if (r.mock)  { console.log("  STOP  it answered in mock mode — the output is fabricated"); process.exit(3); }
    const n = (r.topics || []).length;
    if (!n) { console.log("  warn  it ran but proposed nothing new — not a fault at 74 queued topics"); return; }
    console.log(`  ok    proposed ${n} topics, cost $${(r.costUsd || 0).toFixed(3)}`);
    console.log(`        e.g. ${r.topics[0].topic}`);
  }); '
  [ $? -eq 3 ] && FAIL=1
elif [ $SMOKE -eq 1 ]; then
  echo
  echo "6. Live smoke test — ${DIM}skipped, fix the stops above first${OFF}"
fi

# --- verdict ---------------------------------------------------------------
echo
if [ $FAIL -eq 0 ]; then
  echo "${GRN}GO${OFF} — credentials are live and the pipeline will produce real output."
  echo "${DIM}Warnings above affect how good the demo looks, not whether it works.${OFF}"
else
  echo "${RED}NO-GO${OFF} — fix every STOP above before showing this."
  echo "${DIM}A run started in mock mode looks completely normal on screen and is entirely fabricated.${OFF}"
fi
echo
exit $FAIL
