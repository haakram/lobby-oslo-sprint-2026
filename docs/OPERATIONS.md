# OPERATIONS.md — Runbooks

How to run things, and what to do when the normal flow breaks. The git workflow itself is in
`CONTRIBUTING.md`.

## 1. First-time setup (every teammate)

```bash
git clone <repo-url> && cd <repo>
./scripts/setup.sh
```

`setup.sh` points git at the shared hooks in `.githooks/`, creates `.env` from `.env.example`,
installs the team's Claude Code plugins (§ 9), installs dependencies when the stack has them, and
lists missing tools. Then fill in `.env` with the
values from the team's secret store (`CONTEXT.md` § 9).

Install **gitleaks** (`brew install gitleaks`): it catches a secret before the commit. CI catches it
too, but after the push the secret is already in history.

## 2. The gate: `scripts/check.sh`

| Command | Runs | When |
|---|---|---|
| `./scripts/check.sh` | secrets scan, required docs, no tracked env files, lint, typecheck, tests, build | before opening a PR |
| `./scripts/check.sh --fast` | the same without build | automatically before every push (pre-push hook) |
| `./scripts/check.sh --ci` | everything except the secrets scan (CI has its own job) | in CI |

Until the rehearsal pins exact commands, it detects the stack: with a `package.json` it runs the
`lint`, `typecheck`, `test` and `build` scripts that exist, through the lockfile's package manager;
with a `pyproject.toml` or `requirements.txt` it runs `ruff` and `pytest` when installed. Every step
prints **PASS**, **FAIL** or **SKIP** with the reason, so a skipped step is never read as a pass.

## 3. Git hooks

| Hook | Blocks |
|---|---|
| `pre-commit` | commits on `main` · staged `.env` files · secrets in the staged changes (with gitleaks) |
| `pre-push` | pushes to an existing `main` · pushes where `check.sh --fast` fails |

Hooks are local: each person runs `./scripts/setup.sh` once. The very first commit and the very first
push of a new repo are allowed onto `main`, so the repo can be created. Escape hatches exist
(`ALLOW_MAIN=1`, `--no-verify`) for emergencies agreed with the team; AI_RULES R5.2 forbids them for
normal work, and branch protection still applies on GitHub.

## 4. Environment variables and secrets

- `.env.example` is committed and lists every variable (secrets blank). `.env` and `.env.local` are
  gitignored. The ElevenLabs CLI (`onboard connect`) writes `ELEVENLABS_API_KEY` to `.env.local`;
  everything else lives in `.env`. Code loads `.env`, then `.env.local`.
- **Keys never go through GitHub.** Hamad sends them privately: `./scripts/secrets.sh copy` puts
  them on the clipboard without showing them; send that by AirDrop or a one-time password-manager
  share; the teammate copies what arrived and runs `./scripts/secrets.sh paste`, which writes them
  into `.env` and clears the clipboard. `./scripts/secrets.sh status` shows which are set (names
  only). Never in the repo, an issue, a PR, a channel, a chat log or a screenshot.
- **What stops a key reaching GitHub**, layer by layer: `.gitignore` (env files, `temp/`); the
  pre-commit hook (refuses env files, runs gitleaks, and compares the staged changes with this
  machine's own key values, which matters for formats gitleaks doesn't know, like the Wybe key);
  `check.sh` (the same comparison over the whole history, plus gitleaks); CI's full-history gitleaks
  job; and the repo is private. GitHub's own push protection isn't available for private repos on
  the free plan, which is why the local layers matter. Tested 2026-11-07 with fake keys.
- **Shared Anthropic key, shared budget:** both of us use one key. A USD 30 spend limit is set on it
  in the Anthropic Console (team lead, 2026-11-07), so the cap holds whoever spends; our code's cost
  guard still counts its own spend so it can slow down before the limit cuts it off.
- **Adding a variable:** add it to `.env.example` and `ARCHITECTURE.md` § 4.4 in the same PR; tell the
  team to update their `.env`.
- **A key leaked into git:** rotate it at the provider first, then remove it from the code. Deleting
  the commit doesn't help once it's pushed.
- **A false positive from gitleaks:** add a narrow allowlist entry to `.gitleaks.toml`, with a
  comment saying why it's not a secret (example: the `<your-token>` placeholders in the Scrapling
  skill). Avoid `.gitleaksignore`: its fingerprints include a commit id in history scans, so they stop
  matching once the commit changes.

## 5. Protecting `main` (repo owner, once)

After the first push to GitHub:

```bash
./scripts/protect-main.sh              # PR required, CI green, no force-push or deletion of main
./scripts/protect-main.sh --reviews 1  # … and one approving review
```

It also sets the repo to squash merges only and deletes branches after merge. Needs `gh` logged in
with admin rights. Branch protection is free on **public** repos; a private repo on a free plan
refuses it, and then the rule rests on the local hooks and on convention.

Admins can still bypass the rule on GitHub (`enforce_admins` is off, for a demo-day emergency). The
pre-push hook stops accidental pushes either way.

## 6. CI (GitHub Actions)

`.github/workflows/ci.yml` runs two jobs on every PR and every push to `main`: **`check`** (setup +
`check.sh --ci`) and **`secrets`** (gitleaks over the full history). Both are required for merging.

- **Public repo:** Actions minutes are free.
- **Private repo, free plan:** about 2 000 minutes a month for the whole account. Glimto used up a
  month's minutes in 8 days. Don't add jobs, matrix builds or schedules without counting the cost
  (AI_RULES R7.7).
- A red check: **read the log first**, then fix. Don't re-run blindly.
- Renaming a job means updating the required checks in `scripts/protect-main.sh` too, or every PR
  waits forever for a check that no longer exists.

## 7. Deployment

TBD at the rehearsal: platform, how `main` deploys, preview URLs per PR, how to roll back.

### Night Shift final runbook (Sun 8 Nov, 12:00 Oslo)

The final is `FINAL_ARMED=1 .venv/bin/python -m agent final`: 10 scored shifts in parallel threads
sharing one rate limiter (5 req/s), each stopping itself after 44 real minutes. It refuses to start,
printing why, unless `FINAL_ARMED=1` is in the shell environment (a `.env` file does not count) and
the Oslo time is 11:59-13:00 on 8 Nov. It never falls back to practice.

1. 11:45: last `git pull`, `./scripts/check.sh --fast` green, `.env` has `WYBE_NIGHTSHIFT_KEY`
   (and `ANTHROPIC_API_KEY` if the Brain is used), no practice shift running.
2. 11:59-12:00: Hamad runs the command above in a fresh terminal. ShirazIQ opens
   `.venv/bin/python -m agent viewer` and watches (http://127.0.0.1:8765/).
3. If one shift stops or crashes, do nothing: no hand-steering, no restart, no second `final`. The
   other shifts continue; Ctrl-C stops all of them cleanly (each still writes its `end` line).
4. Afterwards the run logs are in `temp/runs/`; the summary of all shifts is printed at the end.

## 8. Demo day

- [ ] The deployed URL works in a private window, on a phone and on a laptop that isn't the builder's.
- [ ] Seed data reset to the demo state (command: TBD).
- [ ] Backup video on two laptops and available offline.
- [ ] Feature freeze held; nothing merged to `main` in the last hour unless the presenter agrees.
- [ ] Every API key has credit left; rate limits checked.

## 9. AI tools for the team (Claude Code)

Everyone gets the same skills, plugins and tools, so every teammate's AI works the same way.

| What | How a teammate gets it |
|---|---|
| `/kickoff`, `/handoff` | In the repo (`.claude/commands/`): automatic on clone |
| Scrapling skill (web scraping) | In the repo (`.claude/skills/scrapling-official/`, BSD-3 licence included): automatic |
| Playwright and Context7 MCP servers | In the repo (`.mcp.json`, versions pinned): Claude Code asks once to approve them |
| Plugins: superpowers, frontend-design, chrome-devtools-mcp, diagram-design | Listed in `.claude/settings.json`; **`./scripts/setup.sh` installs them** (local scope, in the gitignored `.claude/settings.local.json`) |
| Built-in skills: `/code-review`, `/security-review`, `/simplify`, … | Come with Claude Code |
| docx, pptx, pdf, xlsx skills | Come with the person's claude.ai account, depending on its plan |
| UX Engine | **Not shared.** It's under a commercial licence, and the repo is handed in as "all files" on Sunday, so it must never be committed. It stays on Hamad's machine. |

- **Needs a current Claude Code** (`claude update`). Tested 2026-11-07: 2.1.114 fails to read the
  official plugin list on a fresh machine; 2.1.319 installs all four plugins.
- Each person logs in with their own Claude account; teams pay their own AI costs (CONTEXT § 10).
- **Adding a plugin for everyone:** add it to `enabledPlugins` (and to `extraKnownMarketplaces` if
  it isn't from `claude-plugins-official`) in a PR. Teammates run `./scripts/setup.sh` again.
- Only commit skills whose licence allows sharing, with the licence file next to them.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Pre-commit: "You're committing on main" | `git switch -c <name>/<topic>`; your staged changes come along. Commit again. |
| Push rejected: protected branch | You're pushing `main`. Push your branch and open a PR. |
| Conflict in `MEMORY.md` or `PLAN.md` | Keep both sides: each person's lines are theirs. |
| `check.sh` passes locally, fails in CI | Lockfile out of date, a missing env var in CI, or a step SKIPPED locally because a tool isn't installed. Read the log. |
| A PR waits for a check that never starts | A required check was renamed or removed: see § 6. |
