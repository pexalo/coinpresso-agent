#!/bin/bash
# Run this in YOUR terminal (not the Cowork VM) from the repo root.
# Prints nothing secret — lengths and last four characters only.
echo "cwd: $(pwd)"
echo
echo "--- .env.local ---"
if [ -f .env.local ]; then
  awk -F= '/^[A-Z_]+=/{k=$1;v=substr($0,length(k)+2);printf "  %s  len=%d  ends=%s\n",k,length(v),substr(v,length(v)-3)}' .env.local
else
  echo "  NOT PRESENT"
fi
echo
echo "--- exported in this shell (these WIN over .env.local) ---"
found=0
for v in ANTHROPIC_API_KEY OPENAI_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL; do
  val="${!v}"
  if [ -n "$val" ]; then echo "  $v  len=${#val}  ends=${val: -4}   <-- EXPORTED"; found=1; fi
done
[ $found -eq 0 ] && echo "  none — good"
echo
echo "--- which profile exports it ---"
grep -nE 'ANTHROPIC|OPENAI' ~/.zshrc ~/.zprofile ~/.bash_profile ~/.profile 2>/dev/null | sed -E 's/(=.{0,6}).*/\1.../' || echo "  no references found"
