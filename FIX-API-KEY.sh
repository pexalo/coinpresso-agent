#!/bin/bash
# ---------------------------------------------------------------------------
# Finds out why Anthropic is rejecting the key, and tells you which fix applies.
# Prints NO secrets — only lengths, last four characters, and HTTP status codes.
# Run from the repo root:   ./FIX-API-KEY.sh
# ---------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1
echo "Repo: $(pwd)"
echo "======================================================================"

# --- 1. What is in the file? ----------------------------------------------
FILE_KEY=""
if [ -f .env.local ]; then
  FILE_KEY=$(grep -m1 '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-)
fi

echo
echo "1. .env.local"
if [ ! -f .env.local ]; then
  echo "   MISSING — the file does not exist."
elif [ -z "$FILE_KEY" ]; then
  echo "   exists, but has no ANTHROPIC_API_KEY line."
else
  echo "   ANTHROPIC_API_KEY  len=${#FILE_KEY}  ends='${FILE_KEY: -4}'"
  case "$FILE_KEY" in
    \"*|\'*)          echo "   PROBLEM: value is wrapped in quotes. Remove them." ;;
  esac
  case "$FILE_KEY" in
    " "*|*" ")        echo "   PROBLEM: value has leading/trailing spaces." ;;
  esac
  case "$FILE_KEY" in
    sk-ant-*)         : ;;
    *)                echo "   PROBLEM: does not start with sk-ant- . That is not an Anthropic API key." ;;
  esac
fi

# --- 2. What is exported in this shell? -----------------------------------
echo
echo "2. Shell environment  (these OVERRIDE .env.local — Next reads process.env first)"
SHELL_KEY="${ANTHROPIC_API_KEY}"
if [ -n "$SHELL_KEY" ]; then
  echo "   ANTHROPIC_API_KEY is EXPORTED  len=${#SHELL_KEY}  ends='${SHELL_KEY: -4}'"
  if [ -n "$FILE_KEY" ] && [ "$SHELL_KEY" != "$FILE_KEY" ]; then
    echo "   *** THIS IS YOUR BUG ***"
    echo "   The shell value differs from .env.local, and the SHELL wins."
    echo "   Editing .env.local will never fix it until you remove the export."
  fi
else
  echo "   not exported — good."
fi

echo
echo "3. Which login file exports it"
HITS=$(grep -nE 'ANTHROPIC_API_KEY|OPENAI_API_KEY' ~/.zshrc ~/.zprofile ~/.bash_profile ~/.bashrc ~/.profile 2>/dev/null | sed -E 's/(=.{0,6}).*/\1.../')
if [ -n "$HITS" ]; then echo "$HITS" | sed 's/^/   /'; else echo "   none found"; fi

# --- 4. Test the key against Anthropic directly ---------------------------
TEST_KEY="${SHELL_KEY:-$FILE_KEY}"
TEST_KEY=$(printf '%s' "$TEST_KEY" | tr -d '\r' | sed -E 's/^["\x27]//; s/["\x27]$//; s/^[[:space:]]+//; s/[[:space:]]+$//')

echo
echo "4. Testing that key against Anthropic directly (bypasses the app entirely)"
if [ -z "$TEST_KEY" ]; then
  echo "   No key found to test."
  VERDICT="nokey"
else
  RESP=$(curl -sS -o /tmp/anthropic_test.json -w '%{http_code}' \
    https://api.anthropic.com/v1/messages \
    -H "x-api-key: $TEST_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-sonnet-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' 2>/dev/null)
  echo "   HTTP $RESP"
  head -c 300 /tmp/anthropic_test.json 2>/dev/null | sed 's/^/   /'
  echo
  case "$RESP" in
    200) VERDICT="good" ;;
    401) VERDICT="badkey" ;;
    400) VERDICT="other" ;;
    *)   VERDICT="other" ;;
  esac
fi

# --- 5. Verdict -----------------------------------------------------------
echo
echo "======================================================================"
echo "WHAT TO DO"
echo "======================================================================"
case "$VERDICT" in
  good)
    echo "The key WORKS when called directly. So the app is using a different one."
    echo "Fix:"
    echo "  1)  unset ANTHROPIC_API_KEY OPENAI_API_KEY"
    echo "  2)  make sure .env.local has the working key"
    echo "  3)  stop the dev server (Ctrl-C) and run:  npm run dev"
    ;;
  badkey)
    echo "Anthropic rejected this key directly, outside the app. The key itself is dead."
    echo "The app is fine. Get a new key:"
    echo "  1)  Open  https://console.anthropic.com/settings/keys"
    echo "  2)  Create Key, copy it (starts sk-ant-api03-)"
    echo "  3)  Check the org has credit:  https://console.anthropic.com/settings/billing"
    echo "  4)  Then, in this folder:"
    echo "        unset ANTHROPIC_API_KEY"
    echo "        printf 'ANTHROPIC_API_KEY=PASTE_HERE\\n' > .env.local"
    echo "        printf 'OPENAI_API_KEY=PASTE_HERE\\n' >> .env.local"
    echo "        npm run dev"
    if [ -n "$HITS" ]; then
      echo "  5)  Delete the ANTHROPIC_API_KEY line from your login file (shown in step 3),"
      echo "      or a new terminal will bring the dead key straight back."
    fi
    ;;
  nokey)
    echo "No key is configured anywhere, so the app should be in MOCK mode."
    echo "If you are still seeing a 401, the dev server is running from a DIFFERENT"
    echo "folder than this one. In the terminal running it, press Ctrl-C, then:"
    echo "        cd $(pwd)"
    echo "        npm run dev"
    ;;
  *)
    echo "Anthropic answered with something other than 200 or 401 — read the body above."
    echo "A 400 usually means the request was fine but the model name or account is not."
    ;;
esac
echo
