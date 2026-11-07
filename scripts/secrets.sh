#!/usr/bin/env bash
# Pass the team's keys from one teammate to another without them touching git, chat history or the
# screen (docs/OPERATIONS.md § 4). Values are never printed.
#
#   ./scripts/secrets.sh copy     sender: the keys from .env and .env.local go to the clipboard
#   ./scripts/secrets.sh paste    receiver: the KEY=value lines on the clipboard are merged into .env,
#                                 then the clipboard is cleared
#   ./scripts/secrets.sh status   which keys are set, names only
#
# Send what you copied through a private channel that doesn't keep it: AirDrop, or a password
# manager's one-time share. Never a team channel, an issue, a PR or the repo.
# Without a clipboard (pbcopy/pbpaste on macOS), `copy` writes to stdout and `paste` reads stdin:
#   ./scripts/secrets.sh copy > /path/to/private-file     ./scripts/secrets.sh paste < private-file
# Written for the bash 3.2 that ships with macOS.
set -euo pipefail
cd "$(dirname "$0")/.."

# The secrets the product reads (ARCHITECTURE.md § 4.4). Add a name here when a new secret is added.
KEYS="WYBE_NIGHTSHIFT_KEY ANTHROPIC_API_KEY ELEVENLABS_API_KEY"

have() { command -v "$1" > /dev/null 2>&1; }

# value_of <name>: the last non-empty value across .env then .env.local (the later file wins).
value_of() {
  for f in .env .env.local; do [ -f "$f" ] && cat "$f"; echo; done |
    awk -v k="$1" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2); gsub(/^[ "\x27]+|[ "\x27\r]+$/, "", v); if (v != "") last = v } END { if (last != "") print last }'
}

case "${1:-}" in
  copy)
    out=""
    names=""
    for k in $KEYS; do
      v=$(value_of "$k")
      if [ -n "$v" ]; then
        out="$out$k=$v
"
        names="$names $k"
      fi
    done
    [ -n "$names" ] || { echo "✗ no keys set in .env or .env.local" >&2; exit 1; }
    if have pbcopy && [ -t 1 ]; then
      printf '%s' "$out" | pbcopy
      echo "✓ copied to the clipboard:$names"
      echo "  Send it privately (AirDrop, or a one-time password-manager share). The receiver runs: ./scripts/secrets.sh paste"
    else
      printf '%s' "$out"
    fi
    ;;
  paste)
    if [ -t 0 ] && have pbpaste; then input=$(pbpaste); from_clipboard=1; else input=$(cat); from_clipboard=0; fi
    [ -f .env ] || { [ -f .env.example ] && cp .env.example .env; } || touch .env
    names=""
    for k in $KEYS; do
      line=$(printf '%s\n' "$input" | tr -d '\r' | grep -E "^$k=.+" | tail -n 1 || true)
      [ -n "$line" ] || continue
      # Replace any existing line for this key, then append the new one.
      tmp=$(mktemp)
      grep -vE "^$k=" .env > "$tmp" || true
      [ -s "$tmp" ] && [ "$(tail -c1 "$tmp")" != "" ] && echo >> "$tmp"
      printf '%s\n' "$line" >> "$tmp"
      cat "$tmp" > .env && rm -f "$tmp"
      names="$names $k"
    done
    [ -n "$names" ] || { echo "✗ found no KEY=value lines for:$(printf ' %s' $KEYS)" >&2; exit 1; }
    [ "$from_clipboard" = 1 ] && pbcopy < /dev/null
    echo "✓ written to .env:$names"
    [ "$from_clipboard" = 1 ] && echo "✓ clipboard cleared"
    ;;
  status)
    for k in $KEYS; do
      if [ -n "$(value_of "$k")" ]; then echo "  set    $k"; else echo "  EMPTY  $k"; fi
    done
    ;;
  *)
    echo "usage: $0 copy | paste | status" >&2
    exit 2
    ;;
esac
