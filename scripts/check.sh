#!/usr/bin/env bash
# The gate (docs/OPERATIONS.md § 2). Run before opening a PR; the pre-push hook runs --fast; CI runs --ci.
#
#   ./scripts/check.sh          everything
#   ./scripts/check.sh --fast   no build
#   ./scripts/check.sh --ci     no local secrets scan (CI runs its own full-history job)
#
# Until the rehearsal pins exact commands it detects the stack. Every step ends as PASS, FAIL or SKIP
# with the reason, so a skipped step is never mistaken for a passing one. It runs every step and fails
# at the end if any step failed. Written for the bash 3.2 that ships with macOS: no arrays.
set -uo pipefail
cd "$(dirname "$0")/.."

FAST=0
CI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    --ci) CI_MODE=1 ;;
    *) echo "usage: $0 [--fast] [--ci]" >&2; exit 2 ;;
  esac
done

STARTED=$(date +%s)
FAILED=0
SUMMARY=""
record() { SUMMARY="$SUMMARY
  $1  $2"; if [ "$1" = "FAIL" ]; then FAILED=1; fi; }
run() { # run <label> <command> [args…]
  label=$1
  shift
  printf '\n== %s ==\n' "$label"
  if "$@"; then record "PASS" "$label"; else record "FAIL" "$label"; fi
}
skip() { record "SKIP" "$1 — $2"; }
have() { command -v "$1" > /dev/null 2>&1; }

# 1. Secrets in what's committed (the pre-commit hook covers what's staged).
if [ "$CI_MODE" = 1 ]; then
  skip "secrets" "the CI 'secrets' job scans the full history"
elif ! git rev-parse --verify -q HEAD > /dev/null 2>&1; then
  skip "secrets" "no commits yet"
elif have gitleaks; then
  run "secrets (gitleaks, git history)" gitleaks git --no-banner --redact --verbose --log-level warn .
else
  skip "secrets" "gitleaks not installed (brew install gitleaks)"
fi

# 1b. This machine's own keys (from .env / .env.local) in no commit at all, whatever their format.
#     gitleaks knows the common formats; this catches ours too (e.g. the Wybe key). Values never printed.
if [ "$CI_MODE" = 1 ]; then
  skip "own keys not in git" "CI has no .env"
elif ! git rev-parse --verify -q HEAD > /dev/null 2>&1; then
  skip "own keys not in git" "no commits yet"
else
  found=""
  checked=0
  history=$(git log --all -p --no-color 2> /dev/null)
  for f in .env .env.local; do
    [ -f "$f" ] || continue
    while IFS= read -r line; do
      name=${line%%=*}
      value=$(printf '%s' "${line#*=}" | sed -E "s/^[\"' ]+|[\"' ]+$//g" | tr -d '\r')
      [ ${#value} -ge 8 ] || continue
      checked=$((checked + 1))
      # A here-string, not a pipe: with pipefail, `printf | grep -q` reports a match as a failure
      # (grep stops early, printf gets SIGPIPE).
      if grep -qF -- "$value" <<< "$history"; then found="$found $name"; fi
    done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*=' "$f" || true)
  done
  if [ -n "$found" ]; then
    printf '\nkeys found in git history (rotate them at the provider now):%s\n' "$found"
    record "FAIL" "own keys not in git"
  else
    record "PASS" "own keys not in git ($checked checked)"
  fi
fi

# 2. The docs CLAUDE.md's reading order depends on.
missing=""
for f in CLAUDE.md AGENTS.md MEMORY.md README.md CONTRIBUTING.md .env.example \
  docs/CONTEXT.md docs/PRD.md docs/ARCHITECTURE.md docs/AI_RULES.md docs/PLAN.md docs/OPERATIONS.md; do
  [ -f "$f" ] || missing="$missing $f"
done
if [ -z "$missing" ]; then record "PASS" "required docs"; else printf '\nmissing:%s\n' "$missing"; record "FAIL" "required docs"; fi

# 3. No env file tracked by git (only .env.example).
if git rev-parse --git-dir > /dev/null 2>&1; then
  tracked_env=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)
  if [ -z "$tracked_env" ]; then
    record "PASS" "no env files in git"
  else
    printf '\ntracked env files (git rm --cached them and rotate their keys):\n%s\n' "$tracked_env"
    record "FAIL" "no env files in git"
  fi
fi

STACK=0

# 4. JavaScript / TypeScript: the package.json scripts that exist.
if [ -f package.json ]; then
  STACK=1
  if [ -f pnpm-lock.yaml ]; then PM=pnpm
  elif [ -f yarn.lock ]; then PM=yarn
  elif [ -f bun.lock ] || [ -f bun.lockb ]; then PM=bun
  else PM=npm
  fi
  for s in lint typecheck test build; do
    if [ "$s" = "build" ] && [ "$FAST" = 1 ]; then skip "$PM run build" "--fast"; continue; fi
    if node -e "process.exit((require('./package.json').scripts || {})['$s'] ? 0 : 1)" 2> /dev/null; then
      run "$PM run $s" "$PM" run "$s"
    else
      skip "$PM run $s" "no '$s' script in package.json"
    fi
  done
fi

# 5. Python: ruff and pytest, when installed.
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  STACK=1
  PY=python3
  [ -x .venv/bin/python ] && PY=.venv/bin/python
  if "$PY" -m ruff --version > /dev/null 2>&1; then
    run "ruff" "$PY" -m ruff check .
  else
    skip "ruff" "not installed"
  fi
  if "$PY" -m pytest --version > /dev/null 2>&1; then
    printf '\n== pytest ==\n'
    "$PY" -m pytest -q
    rc=$?
    case "$rc" in
      0) record "PASS" "pytest" ;;
      5) skip "pytest" "no tests collected" ;;
      *) record "FAIL" "pytest" ;;
    esac
  else
    skip "pytest" "not installed"
  fi
fi

[ "$STACK" = 0 ] && skip "code checks" "no stack yet (no package.json, pyproject.toml or requirements.txt)"

printf '\n== summary ==%s\n' "$SUMMARY"
if [ "$FAILED" = 1 ]; then
  printf '\nGATE FAILED after %s s.\n' "$(($(date +%s) - STARTED))"
  exit 1
fi
printf '\nGATE PASSED in %s s.\n' "$(($(date +%s) - STARTED))"
