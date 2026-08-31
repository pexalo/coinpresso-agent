#!/bin/bash
# ---------------------------------------------------------------------------
# One-shot setup for the model keys.
#
# Prompts for each key, TESTS it against the provider, and only writes
# .env.local if both actually work. Then stops ~/.zshrc from overriding it.
#
# Your keys are typed by you, into your own machine. They are never echoed to
# the screen and never leave your Mac.
#
#   cd ~/Pexalo/coinpresso-agent && ./SETUP-KEYS.sh
# ---------------------------------------------------------------------------

set -u
cd "$(dirname "$0")" || exit 1

GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
ok()   { printf "%s✓%s %s\n" "$GREEN" "$OFF" "$1"; }
bad()  { printf "%s✗%s %s\n" "$RED" "$OFF" "$1"; }
note() { printf "%s  %s%s\n" "$DIM" "$1" "$OFF"; }

echo
echo "Setting up model keys for: $(pwd)"
echo "======================================================================"

# --- Anthropic -------------------------------------------------------------
echo
echo "1/2  ANTHROPIC  ${DIM}(strategy, writer, ideation)${OFF}"
note "Get one at https://console.anthropic.com/settings/keys — starts sk-ant-api03-"
echo
printf "     Paste the Anthropic key (input hidden): "
read -r -s ANTHRO
echo

ANTHRO=$(printf '%s' "$ANTHRO" | tr -d '\r"'"'" | xargs)

if [ -z "$ANTHRO" ]; then
  bad "Nothing entered. Run the script again when you have the key."
  exit 1
fi
case "$ANTHRO" in
  sk-ant-*) ;;
  *) bad "That does not start with sk-ant- — it is not an Anthropic API key."; exit 1 ;;
esac

printf "     Testing… "
A_CODE=$(curl -sS -o /tmp/_a.json -w '%{http_code}' --max-time 25 \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHRO" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' 2>/dev/null)

if [ "$A_CODE" = "200" ]; then
  ok "Anthropic accepted the key."
else
  bad "Anthropic returned HTTP $A_CODE"
  sed 's/^/     /' /tmp/_a.json 2>/dev/null | head -3
  echo
  if [ "$A_CODE" = "401" ]; then
    note "That key is not recognised. Create a fresh one and check the org has credit:"
    note "https://console.anthropic.com/settings/billing"
  fi
  note "Nothing was written. Fix the key and run this again."
  rm -f /tmp/_a.json
  exit 1
fi

# --- OpenAI ----------------------------------------------------------------
echo
echo "2/2  OPENAI  ${DIM}(reviewer — the cross-family gate)${OFF}"
note "Get one at https://platform.openai.com/api-keys"
echo
printf "     Paste the OpenAI key (input hidden): "
read -r -s OPENAI
echo

OPENAI=$(printf '%s' "$OPENAI" | tr -d '\r"'"'" | xargs)

if [ -z "$OPENAI" ]; then
  bad "Nothing entered."
  exit 1
fi

printf "     Testing… "
O_CODE=$(curl -sS -o /tmp/_o.json -w '%{http_code}' --max-time 25 \
  https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI" -H "content-type: application/json" \
  -d '{"model":"gpt-4.1","max_completion_tokens":1,"messages":[{"role":"user","content":"hi"}]}' 2>/dev/null)

if [ "$O_CODE" = "200" ]; then
  ok "OpenAI accepted the key."
else
  bad "OpenAI returned HTTP $O_CODE"
  sed 's/^/     /' /tmp/_o.json 2>/dev/null | head -3
  echo
  note "Nothing was written. Fix the key and run this again."
  rm -f /tmp/_a.json /tmp/_o.json
  exit 1
fi

rm -f /tmp/_a.json /tmp/_o.json

# --- Write .env.local ------------------------------------------------------
echo
echo "----------------------------------------------------------------------"
if [ -f .env.local ]; then
  cp .env.local ".env.local.backup.$(date +%Y%m%d%H%M%S)"
  note "Existing .env.local backed up."
fi

printf 'ANTHROPIC_API_KEY=%s\nOPENAI_API_KEY=%s\n' "$ANTHRO" "$OPENAI" > .env.local
chmod 600 .env.local
ok "Wrote .env.local (git ignores it — it will never be committed)."

# --- Stop .zshrc shadowing -------------------------------------------------
ZSHRC="$HOME/.zshrc"
if grep -qE '^export (ANTHROPIC_API_KEY|OPENAI_API_KEY)=' "$ZSHRC" 2>/dev/null; then
  cp "$ZSHRC" "$ZSHRC.backup.$(date +%Y%m%d%H%M%S)"
  sed -i '' 's/^export ANTHROPIC_API_KEY=/# disabled by SETUP-KEYS.sh — use .env.local instead\
# export ANTHROPIC_API_KEY=/' "$ZSHRC"
  sed -i '' 's/^export OPENAI_API_KEY=/# disabled by SETUP-KEYS.sh — use .env.local instead\
# export OPENAI_API_KEY=/' "$ZSHRC"
  ok "Commented out the exports in ~/.zshrc (backed up first)."
  note "Those were overriding .env.local — Next reads process.env first."
else
  ok "No conflicting exports in ~/.zshrc."
fi

echo
echo "======================================================================"
printf "%sDone.%s Now run:\n\n" "$GREEN" "$OFF"
echo "    unset ANTHROPIC_API_KEY OPENAI_API_KEY"
echo "    npm run dev"
echo
echo "Then open  http://localhost:3000/api/health?probe=1"
echo "You want:  \"mode\": \"live\"  and  \"warnings\": []"
echo
