#!/usr/bin/env bash
# One-time setup for every teammate (docs/OPERATIONS.md § 1), and the install step in CI.
#
#   ./scripts/setup.sh        git hooks, .env, dependencies, missing-tool check
#   ./scripts/setup.sh --ci   dependencies only, exactly as the lockfile says
#
# Written for the bash 3.2 that ships with macOS: no arrays, no mapfile.
set -euo pipefail
cd "$(dirname "$0")/.."

CI_MODE=0
case "${1:-}" in
  "") ;;
  --ci) CI_MODE=1 ;;
  *) echo "usage: $0 [--ci]" >&2; exit 2 ;;
esac

say() { printf '%s\n' "$*"; }
have() { command -v "$1" > /dev/null 2>&1; }

if [ "$CI_MODE" = 0 ]; then
  # 1. Shared git hooks from .githooks/ instead of each person's untracked .git/hooks.
  if git rev-parse --git-dir > /dev/null 2>&1; then
    git config core.hooksPath .githooks
    chmod +x .githooks/* scripts/*.sh
    say "✓ git hooks active: .githooks/pre-commit, .githooks/pre-push"
  else
    say "! not a git repository yet: run 'git init -b main' (or clone), then run this script again"
  fi

  # 2. Local env file from the committed template.
  if [ -f .env ]; then
    say "✓ .env exists"
  elif [ -f .env.example ]; then
    cp .env.example .env
    say "✓ .env created from .env.example: fill in the values (CONTEXT.md § 9 says where they live)"
  fi
fi

# 3. Dependencies, for whichever stack the repo has.
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then PM=pnpm
  elif [ -f yarn.lock ]; then PM=yarn
  elif [ -f bun.lock ] || [ -f bun.lockb ]; then PM=bun
  else PM=npm
  fi
  say "→ installing JavaScript dependencies with $PM"
  if [ "$CI_MODE" = 1 ]; then
    case "$PM" in
      pnpm) pnpm install --frozen-lockfile ;;
      yarn) yarn install --frozen-lockfile ;;
      bun) bun install --frozen-lockfile ;;
      npm) if [ -f package-lock.json ]; then npm ci; else npm install; fi ;;
    esac
  else
    "$PM" install
  fi
fi

if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
  if [ "$CI_MODE" = 1 ]; then
    say "→ installing Python dependencies"
    python -m pip install --upgrade pip
    if [ -f requirements.txt ]; then python -m pip install -r requirements.txt; fi
    if [ -f requirements-dev.txt ]; then python -m pip install -r requirements-dev.txt; fi
    if [ -f pyproject.toml ] && [ ! -f requirements.txt ]; then python -m pip install -e .; fi
  else
    # Locally everyone has their own virtualenv habits (venv, uv, conda), so this only points the way.
    say "! Python project: create and activate a virtualenv (.venv), then install the dependencies"
  fi
fi

# 4. The team's Claude Code plugins (docs/OPERATIONS.md § 10). Listing a plugin in .claude/settings.json
#    doesn't install it on a teammate's machine, so this does, at local scope (.claude/settings.local.json,
#    gitignored): nobody's global setup changes. The list is read from .claude/settings.json, the one source.
if [ "$CI_MODE" = 0 ] && [ -f .claude/settings.json ]; then
  if have claude; then
    read_settings() { # read_settings plugins|markets
      python3 -c '
import json, sys
s = json.load(open(".claude/settings.json"))
if sys.argv[1] == "plugins":
    print(" ".join(k for k, v in s.get("enabledPlugins", {}).items() if v))
else:
    print(" ".join(m["source"]["repo"] for m in s.get("extraKnownMarketplaces", {}).values() if m.get("source", {}).get("source") == "github"))
' "$1" 2> /dev/null || true
    }
    plugins=$(read_settings plugins)
    markets=$(read_settings markets)
    if [ -z "$plugins" ]; then
      say "! couldn't read the plugin list (needs python3): install the plugins in .claude/settings.json by hand"
    fi
    claude plugin marketplace add anthropics/claude-plugins-official > /dev/null 2>&1 || true
    for repo in $markets; do claude plugin marketplace add "$repo" > /dev/null 2>&1 || true; done
    for p in $plugins; do
      if claude plugin install "$p" --scope local > /dev/null 2>&1; then
        say "✓ Claude Code plugin: $p"
      else
        # Seen 2026-11-07: Claude Code 2.1.114 can't parse today's official marketplace file; 2.1.319 can.
        say "! plugin $p didn't install. Update Claude Code first ('claude update'), then run this script again"
      fi
    done
  else
    say "! Claude Code CLI not found: install Claude Code, then run this script again for the team's plugins"
  fi
fi

# 5. Tools worth having (local only).
if [ "$CI_MODE" = 0 ]; then
  have git || say "✗ git is missing"
  have gitleaks || say "! gitleaks is missing: secrets won't be caught before commit (brew install gitleaks)"
  have gh || say "! gh (GitHub CLI) is missing: needed for PRs from the terminal (brew install gh)"
  if [ -f package.json ] && ! have node; then say "✗ node is missing"; fi
  say "Done. Next: fill in .env, then read CLAUDE.md (or run /kickoff in Claude Code)."
fi
